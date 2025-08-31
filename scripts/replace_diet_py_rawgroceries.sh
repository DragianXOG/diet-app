#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
API_FILE="app/api/diet.py"
BACKUP="${API_FILE}.bak.$(date +%s)"
SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"

[[ -f "$API_FILE" ]] || { echo "❌ $API_FILE not found. Run from your repo root."; exit 1; }

cp -a "$API_FILE" "$BACKUP"
echo "🗂  Backup -> $BACKUP"

cat > "$API_FILE" <<'PY'
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import Optional, List, Dict, Any
from contextlib import contextmanager
from pathlib import Path
from datetime import date, datetime, timedelta, time
import json
import re

from pydantic import BaseModel

from sqlmodel import Session, select
from sqlalchemy import text, func
from sqlalchemy.exc import OperationalError

from app.core.db import get_session
from app.core.security import get_current_user
from app.models import User, Intake, Meal, MealItem  # NOTE: GroceryItem intentionally not used

router = APIRouter()

# ------------------------------------------------------------------------------
# Import-time safety for annotations: IntakeIn might be referenced before defined
# ------------------------------------------------------------------------------
try:
    from app.models import IntakeIn as _RealIntakeIn  # type: ignore
    IntakeIn = _RealIntakeIn
except Exception:
    class IntakeIn(BaseModel):
        food_notes: Optional[str] = None
        workout_notes: Optional[str] = None

# ------------------------------------------------------------------------------
# RLS helpers (Postgres set_config pinned to the same connection) + rls_session
# Re-entrant (reference-counted) so nested uses don't RESET too early.
# ------------------------------------------------------------------------------
def _set_rls(session: Session, uid: int) -> None:
    try:
        if session.info.get("_rls_uid") == uid and session.info.get("_rls_depth", 0) > 0:
            return
        conn = session.connection()  # pin the connection
        conn.execute(text("select set_config('app.user_id', :val, false)"), {"val": str(uid)})
        session.info["_rls_uid"] = uid
    except OperationalError:
        pass
    except Exception:
        pass

def _reset_rls(session: Session) -> None:
    try:
        conn = session.connection()
        conn.execute(text("reset app.user_id"))
    except OperationalError:
        pass
    except Exception:
        pass
    finally:
        session.info.pop("_rls_uid", None)

@contextmanager
def _rls(session: Session, uid: int):
    depth = session.info.get("_rls_depth", 0)
    if depth == 0:
        _set_rls(session, uid)
    session.info["_rls_depth"] = depth + 1
    try:
        yield
    finally:
        depth2 = session.info.get("_rls_depth", 1) - 1
        if depth2 <= 0:
            session.info["_rls_depth"] = 0
            _reset_rls(session)
            session.info.pop("_rls_depth", None)
        else:
            session.info["_rls_depth"] = depth2

def rls_session(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    depth = session.info.get("_rls_depth", 0)
    if depth == 0:
        _set_rls(session, user.id)
    session.info["_rls_depth"] = depth + 1
    try:
        yield session
    finally:
        depth2 = session.info.get("_rls_depth", 1) - 1
        if depth2 <= 0:
            session.info["_rls_depth"] = 0
            _reset_rls(session)
            session.info.pop("_rls_depth", None)
        else:
            session.info["_rls_depth"] = depth2

# ------------------------------------------------------------------------------
# Heuristics & helpers
# ------------------------------------------------------------------------------
_PRICE_BOOK: Dict[str, Dict[str, float]] = {
    "chicken breast": {"ALDI": 2.49, "WALMART": 2.84, "COSTCO": 2.39},
    "salmon": {"ALDI": 9.99, "WALMART": 10.49, "COSTCO": 9.59},
    "eggs": {"ALDI": 3.19, "WALMART": 3.49, "COSTCO": 3.09},
    "broccoli": {"ALDI": 1.69, "WALMART": 1.79, "COSTCO": 1.49},
    "spinach": {"ALDI": 1.89, "WALMART": 1.98, "COSTCO": 1.69},
    "olive oil": {"ALDI": 5.49, "WALMART": 5.99, "COSTCO": 5.29},
    "greek yogurt": {"ALDI": 4.19, "WALMART": 4.39, "COSTCO": 3.99},
    "oats": {"ALDI": 2.29, "WALMART": 2.39, "COSTCO": 2.09},
    "avocado": {"ALDI": 0.89, "WALMART": 0.98, "COSTCO": 0.79},
}
_DEFAULT_PRICE: Dict[str, float] = {"ALDI": 2.00, "WALMART": 2.10, "COSTCO": 1.95}
_STORES = ("ALDI", "WALMART", "COSTCO")

def _normalize_name(s: str) -> str:
    return re.sub(r"[^a-z0-9\s]", "", (s or "").lower()).strip()

def _prefer_store_from_intake(intake: Optional[Intake]) -> Optional[str]:
    if not intake:
        return None
    notes = f"{getattr(intake, 'food_notes', '')} {getattr(intake, 'workout_notes', '')}".lower()
    if "aldi" in notes: return "ALDI"
    if "walmart" in notes: return "WALMART"
    if "costco" in notes: return "COSTCO"
    return None

def _price_map_for_item(name: str) -> Dict[str, float]:
    n = _normalize_name(name)
    return _PRICE_BOOK.get(n, _DEFAULT_PRICE)

FALLBACK_INGREDIENTS: Dict[str, List[str]] = {
    "grilled chicken salad": ["chicken breast", "spinach", "olive oil", "avocado"],
    "salmon and broccoli": ["salmon", "broccoli", "olive oil"],
    "greek yogurt bowl": ["greek yogurt", "oats"],
    "eggs and spinach": ["eggs", "spinach", "olive oil"],
}

def _fallback_ingredients_from_title(title: str) -> List[str]:
    t = _normalize_name(title)
    for key, items in FALLBACK_INGREDIENTS.items():
        if key in t:
            return list(items)
    return ["eggs", "spinach"]

def _safe_set(obj: Any, field: str, value: Any) -> None:
    if hasattr(obj, field):
        setattr(obj, field, value)

def _ensure_dir(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)

# ---- Time-window helper: supports either Meal.date (date) or Meal.eaten_at (datetime)
def _meal_window_filters(start: Optional[date], end: Optional[date]) -> List[Any]:
    filters: List[Any] = []
    has_date = hasattr(Meal, "date")
    has_eaten = hasattr(Meal, "eaten_at")
    if has_date:
        if start: filters.append(Meal.date >= start)      # type: ignore[attr-defined]
        if end:   filters.append(Meal.date <= end)        # type: ignore[attr-defined]
    elif has_eaten:
        if start: filters.append(func.date(Meal.eaten_at) >= start)  # type: ignore[attr-defined]
        if end:   filters.append(func.date(Meal.eaten_at) <= end)    # type: ignore[attr-defined]
    return filters

# ------------------------------------------------------------------------------
# Intake endpoints
# ------------------------------------------------------------------------------
@router.get("/intake")
def get_intake(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
):
    with _rls(session, user.id):
        intake = session.exec(select(Intake).where(Intake.user_id == user.id)).first()
        return intake or {}

@router.post("/intake")
def upsert_intake(
    payload: IntakeIn,
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
):
    with _rls(session, user.id):
        intake = session.exec(select(Intake).where(Intake.user_id == user.id)).first()
        if not intake:
            intake = Intake(user_id=user.id)  # type: ignore[call-arg]
            session.add(intake)
        for fld in ("food_notes", "workout_notes"):
            _safe_set(intake, fld, getattr(payload, fld, None))
        session.commit()
        session.refresh(intake)
        return intake

class RationalizeOut(BaseModel):
    diet_label: str
    meals_per_day: int
    times: List[str]
    protein_target: Optional[int] = None
    carb_target: Optional[int] = None
    safety_required: bool = False

@router.post("/intake/rationalize", response_model=RationalizeOut)
def rationalize_intake(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
):
    with _rls(session, user.id):
        intake = session.exec(select(Intake).where(Intake.user_id == user.id)).first()
        notes = (getattr(intake, "food_notes", "") or "") + " " + (getattr(intake, "workout_notes", "") or "")
        notes_l = notes.lower()

        low_carb = any(k in notes_l for k in ("keto", "low carb", "lower carb"))
        if_2 = any(k in notes_l for k in ("if 2/day", "2-meal", "two meals", "16:8"))
        aggressive = any(k in notes_l for k in ("rapid", "aggressive", "very fast"))

        label = "lower‑carb; IF 16:8 (2/day)" if (low_carb or if_2) else "balanced; 3/day"
        mpd = 2 if (low_carb or if_2) else 3
        times = ["12:00", "18:00"] if mpd == 2 else ["08:00", "12:00", "18:00"]
        protein = 140 if low_carb else 110
        carb = 120 if low_carb else 200

        return RationalizeOut(
            diet_label=label,
            meals_per_day=mpd,
            times=times,
            protein_target=protein,
            carb_target=carb,
            safety_required=aggressive,
        )

# ------------------------------------------------------------------------------
# Meals endpoints
# ------------------------------------------------------------------------------
class MealInput(BaseModel):
    date: date
    title: str
    items: Optional[List[str]] = None

class MealsCreateRequest(BaseModel):
    meals: List[MealInput]

@router.get("/meals")
def list_meals(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    with _rls(session, user.id):
        q = select(Meal).where(Meal.user_id == user.id)
        for cond in _meal_window_filters(start, end):
            q = q.where(cond)
        return session.exec(q).all()

@router.post("/meals")
def create_meals(
    req: MealsCreateRequest,
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
):
    created = 0
    with _rls(session, user.id):
        for m in req.meals:
            meal = Meal(user_id=user.id)  # type: ignore[call-arg]
            _safe_set(meal, "date", m.date)
            if hasattr(meal, "title"):
                meal.title = m.title  # type: ignore[attr-defined]
            elif hasattr(meal, "name"):
                meal.name = m.title  # type: ignore[attr-defined]
            if hasattr(meal, "eaten_at"):
                _safe_set(meal, "eaten_at", datetime.combine(m.date, time(12, 0)))
            session.add(meal)
            session.flush()
            for it_name in (m.items or []):
                mi = MealItem(meal_id=meal.id)  # type: ignore[call-arg]
                if hasattr(mi, "name"):
                    mi.name = it_name  # type: ignore[attr-defined]
                elif hasattr(mi, "ingredient"):
                    mi.ingredient = it_name  # type: ignore[attr-defined]
                session.add(mi)
            created += 1
        session.commit()
    return {"created": created}

# ------------------------------------------------------------------------------
# Plans: generate w/ recipes + persist history; list & fetch history
# ------------------------------------------------------------------------------
class PlanGenerateRequest(BaseModel):
    days: int = 7
    persist: bool = True
    include_recipes: bool = True
    confirm: Optional[bool] = False

def _make_recipe(title: str) -> Dict[str, Any]:
    ing = _fallback_ingredients_from_title(title)
    steps = [
        f"Prep ingredients for {title}.",
        f"Cook {title} and plate.",
    ]
    return {"ingredients": ing, "steps": steps}

def _default_pairs() -> List[str]:
    return [
        "Grilled Chicken Salad",
        "Salmon and Broccoli",
        "Greek Yogurt Bowl",
        "Eggs and Spinach",
    ]

@router.post("/plans/generate")
def generate_plan(
    req: PlanGenerateRequest = Body(...),
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
):
    if req.days <= 0 or req.days > 31:
        raise HTTPException(status_code=400, detail="days must be 1..31")

    start_dt = date.today()
    days: List[Dict[str, Any]] = []
    pairs = _default_pairs()

    with _rls(session, user.id):
        r = rationalize_intake(session=session, user=user)
        meals_per_day = r.meals_per_day if isinstance(r, RationalizeOut) else 2
        times = r.times if isinstance(r, RationalizeOut) else ["12:00", "18:00"]

        for i in range(req.days):
            d = start_dt + timedelta(days=i)
            day_meals = []
            for j in range(meals_per_day):
                title = pairs[(i + j) % len(pairs)]
                rec = _make_recipe(title) if req.include_recipes else None
                day_meals.append({"time": times[j % len(times)], "title": title, "recipe": rec})
            days.append({"date": str(d), "meals": day_meals})

        if req.persist:
            for day in days:
                d = date.fromisoformat(day["date"])
                for meal_stub in day["meals"]:
                    m = Meal(user_id=user.id)  # type: ignore[call-arg]
                    _safe_set(m, "date", d)
                    if hasattr(m, "title"):
                        m.title = meal_stub["title"]  # type: ignore[attr-defined]
                    elif hasattr(m, "name"):
                        m.name = meal_stub["title"]  # type: ignore[attr-defined]
                    if hasattr(m, "eaten_at"):
                        try:
                            tt = time.fromisoformat(meal_stub.get("time") or "12:00")
                        except Exception:
                            tt = time(12, 0)
                        _safe_set(m, "eaten_at", datetime.combine(d, tt))
                    session.add(m)
                    session.flush()
                    if meal_stub.get("recipe"):
                        for ing in meal_stub["recipe"]["ingredients"]:
                            mi = MealItem(meal_id=m.id)  # type: ignore[call-arg]
                            if hasattr(mi, "name"):
                                mi.name = ing  # type: ignore[attr-defined]
                            elif hasattr(mi, "ingredient"):
                                mi.ingredient = ing  # type: ignore[attr-defined]
                            session.add(mi)
            session.commit()

        plans_dir = Path(f"data/plans/user-{user.id}")
        _ensure_dir(plans_dir / "dummy")
        plan_json = {
            "label": "Auto Plan",
            "start": str(start_dt),
            "end": str(start_dt + timedelta(days=req.days - 1)),
            "days": days,
        }
        with (plans_dir / f"{start_dt}.json").open("w", encoding="utf-8") as f:
            json.dump(plan_json, f, ensure_ascii=False, indent=2)

    return plan_json

@router.get("/plans")
def list_plans(
    *,
    user: User = Depends(get_current_user),
):
    plans_dir = Path(f"data/plans/user-{user.id}")
    if not plans_dir.exists():
        return []
    out = []
    for fp in sorted(plans_dir.glob("*.json")):
        try:
            with fp.open("r", encoding="utf-8") as f:
                data = json.load(f)
            out.append(
                {
                    "start": data.get("start") or fp.stem,
                    "end": data.get("end"),
                    "label": data.get("label", "Auto Plan"),
                    "days": len(data.get("days") or []),
                }
            )
        except Exception:
            continue
    return out

@router.get("/plans/{start}")
def get_plan(
    start: str,
    *,
    user: User = Depends(get_current_user),
):
    fp = Path(f"data/plans/user-{user.id}/{start}.json")
    if not fp.exists():
        raise HTTPException(status_code=404, detail="Plan not found")
    with fp.open("r", encoding="utf-8") as f:
        return json.load(f)

# ------------------------------------------------------------------------------
# Groceries (RAW SQL; never reference missing pricing columns)
#   - add_grocery
#   - list_groceries
#   - toggle_purchased
#   - sync_from_meals
#   - price_preview
#   - price_assign (DB persist if possible, else file fallback)
# ------------------------------------------------------------------------------
class GroceryCreate(BaseModel):
    name: str
    quantity: Optional[float] = 1.0

@router.post("/groceries")
def add_grocery(
    item: GroceryCreate,
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
):
    with _rls(session, user.id):
        res = session.exec(
            text("""
                INSERT INTO grocery_items (user_id, name, quantity, unit, purchased)
                VALUES (:uid, :name, :qty, NULL, :pfalse)
                RETURNING id, user_id, name, quantity, unit, purchased
            """),
            {"uid": user.id, "name": item.name, "qty": float(item.quantity or 1.0), "pfalse": False},
        )
        session.commit()
        row = res.mappings().first()
        return dict(row) if row else {"ok": True}

@router.get("/groceries")
def list_groceries(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
    only_open: bool = Query(False, description="Show only items not yet purchased"),
):
    with _rls(session, user.id):
        sql = """
            SELECT id, user_id, name, quantity, unit, purchased
            FROM grocery_items
            WHERE user_id = :uid
        """
        params = {"uid": user.id, "pfalse": False}
        if only_open:
            sql += " AND purchased = :pfalse"
        sql += " ORDER BY id"
        rows = session.exec(text(sql), params).mappings().all()
        return [dict(r) for r in rows]

@router.patch("/groceries/{item_id}")
def toggle_grocery_purchased(
    item_id: int,
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
):
    with _rls(session, user.id):
        row = session.exec(
            text("SELECT purchased FROM grocery_items WHERE id=:id AND user_id=:uid"),
            {"id": item_id, "uid": user.id},
        ).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Grocery item not found")
        current = bool(row[0])
        session.exec(
            text("UPDATE grocery_items SET purchased=:p WHERE id=:id AND user_id=:uid"),
            {"p": not current, "id": item_id, "uid": user.id},
        )
        session.commit()
        row2 = session.exec(
            text("SELECT id, user_id, name, quantity, unit, purchased FROM grocery_items WHERE id=:id AND user_id=:uid"),
            {"id": item_id, "uid": user.id},
        ).mappings().first()
        return dict(row2) if row2 else {"id": item_id, "purchased": not current}

@router.post("/groceries/sync_from_meals")
def sync_groceries_from_meals(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
    start: date = Query(..., description="YYYY-MM-DD"),
    end: date = Query(..., description="YYYY-MM-DD"),
    persist: bool = Query(True),
    clear_existing: bool = Query(False),
    seed_if_empty: bool = Query(
        True,
        description="If no meals exist in window, seed a default 7-day, 2-meals/day plan (and persist meals when persist=true).",
    ),
):
    with _rls(session, user.id):
        if clear_existing:
            session.exec(
                text("DELETE FROM grocery_items WHERE user_id=:uid AND purchased=:pfalse"),
                {"uid": user.id, "pfalse": False},
            )
            session.commit()

        # Query meals in window (time-aware)
        q = select(Meal).where(Meal.user_id == user.id)
        for cond in _meal_window_filters(start, end):
            q = q.where(cond)
        meals = session.exec(q).all()

        if not meals and seed_if_empty:
            pairs = _default_pairs()
            cur = start
            while cur <= end:
                for j in range(2):
                    title = pairs[((cur - start).days + j) % len(pairs)]
                    m = Meal(user_id=user.id)  # type: ignore[call-arg]
                    _safe_set(m, "date", cur)
                    if hasattr(m, "title"):
                        m.title = title  # type: ignore[attr-defined]
                    elif hasattr(m, "name"):
                        m.name = title  # type: ignore[attr-defined]
                    if hasattr(m, "eaten_at"):
                        _safe_set(m, "eaten_at", datetime.combine(cur, time(12, 0)))
                    session.add(m)
                    session.flush()
                    for ing in _fallback_ingredients_from_title(title):
                        mi = MealItem(meal_id=m.id)  # type: ignore[call-arg]
                        if hasattr(mi, "name"):
                            mi.name = ing  # type: ignore[attr-defined]
                        elif hasattr(mi, "ingredient"):
                            mi.ingredient = ing  # type: ignore[attr-defined]
                        session.add(mi)
                cur += timedelta(days=1)
            if persist:
                session.commit()
            # Re-query after seeding
            q = select(Meal).where(Meal.user_id == user.id)
            for cond in _meal_window_filters(start, end):
                q = q.where(cond)
            meals = session.exec(q).all()

        # Aggregate ingredient counts
        name_counts: Dict[str, float] = {}
        for m in meals:
            mis = session.exec(select(MealItem).where(MealItem.meal_id == m.id)).all()
            if mis:
                for it in mis:
                    nm = getattr(it, "name", None) or getattr(it, "ingredient", None)
                    if not nm:
                        continue
                    qty = 1.0
                    for field in ("quantity", "qty", "count"):
                        if hasattr(it, field):
                            try:
                                qty = float(getattr(it, field) or 1.0)
                            except Exception:
                                pass
                            break
                    name_counts[nm] = name_counts.get(nm, 0.0) + max(1.0, qty)
            else:
                title = getattr(m, "title", None) or getattr(m, "name", "")
                for nm in _fallback_ingredients_from_title(title or ""):
                    name_counts[nm] = name_counts.get(nm, 0.0) + 1.0

        created = 0
        if persist:
            for nm, qty in name_counts.items():
                row = session.exec(
                    text("""
                        SELECT id, quantity
                        FROM grocery_items
                        WHERE user_id=:uid AND name=:nm AND purchased=:pfalse
                        LIMIT 1
                    """),
                    {"uid": user.id, "nm": nm, "pfalse": False},
                ).mappings().first()
                if row:
                    session.exec(
                        text("UPDATE grocery_items SET quantity = COALESCE(quantity,0) + :add WHERE id=:id"),
                        {"add": float(qty), "id": row["id"]},
                    )
                else:
                    session.exec(
                        text("""
                            INSERT INTO grocery_items (user_id, name, quantity, unit, purchased)
                            VALUES (:uid, :nm, :qty, NULL, :pfalse)
                        """),
                        {"uid": user.id, "nm": nm, "qty": float(qty), "pfalse": False},
                    )
                    created += 1
            session.commit()

        return {"created": created, "count": len(name_counts), "window": {"start": str(start), "end": str(end)}}

@router.get("/groceries/price_preview")
def price_preview(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
):
    with _rls(session, user.id):
        rows = session.exec(
            text("""
                SELECT id, name, quantity
                FROM grocery_items
                WHERE user_id=:uid AND purchased=:pfalse
                ORDER BY id
            """),
            {"uid": user.id, "pfalse": False},
        ).mappings().all()

        intake = session.exec(select(Intake).where(Intake.user_id == user.id)).first()
        prefer = _prefer_store_from_intake(intake)

        preview_items: List[Dict[str, Any]] = []
        totals = {s: 0.0 for s in _STORES}

        for r in rows:
            name = r["name"]
            qty = float(r.get("quantity") or 1.0)
            price_map = _price_map_for_item(name)
            store = prefer or min(price_map, key=price_map.get)
            unit_price = float(price_map[store])
            total_price = round(unit_price * max(1.0, qty), 2)
            totals[store] += total_price

            preview_items.append(
                {"id": r["id"], "name": name, "suggested_store": store, "unit_price": unit_price, "total_price": total_price}
            )

        grand_total = round(sum(totals.values()), 2)
        return {"items": preview_items, "totals": {k: round(v, 2) for k, v in totals.items()}, "grand_total": grand_total}

def _persist_prices_fallback(user_id: int, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    path = Path(f"data/prices/user-{user_id}.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump({"items": items, "saved_at": datetime.utcnow().isoformat()}, f, ensure_ascii=False, indent=2)
    return {"backend": "file", "path": str(path)}

@router.post("/groceries/price_assign")
def price_assign(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(get_current_user),
):
    with _rls(session, user.id):
        prev = price_preview(session=session, user=user)
        items: List[Dict[str, Any]] = prev["items"]
        meta: Dict[str, Any] = {"backend": "db"}
        updated = 0
        try:
            # Try DB persist (works if columns exist & privileges allow)
            for stub in items:
                session.exec(
                    text("""
                        UPDATE grocery_items
                        SET store=:s, unit_price=:u, total_price=:t
                        WHERE id=:id AND user_id=:uid
                    """),
                    {
                        "s": stub["suggested_store"],
                        "u": float(stub["unit_price"]),
                        "t": float(stub["total_price"]),
                        "id": stub["id"],
                        "uid": user.id,
                    },
                )
                updated += 1
            session.commit()
        except Exception:
            # Fallback to file persistence if DB columns are missing or not permitted
            meta = _persist_prices_fallback(user.id, items)
            updated = len(items)
        return {"updated": updated, "totals": prev["totals"], "grand_total": prev["grand_total"], "persist": meta}
PY

# Import test
PY_BIN="$ROOT/.venv/bin/python"; [[ -x "$PY_BIN" ]] || PY_BIN="$(command -v python3)"
echo "🔎 Import test ..."
PYTHONPATH="$ROOT" "$PY_BIN" - <<'PY'
import importlib
m = importlib.import_module("app.main")
print("ok", type(m.app).__name__)
PY

# Restart service (if present)
if systemctl --user list-units | grep -q "$SERVICE_NAME"; then
  echo "🔁 Restarting $SERVICE_NAME ..."
  systemctl --user daemon-reload || true
  systemctl --user restart "$SERVICE_NAME" || true
  sleep 1
  systemctl --user status "$SERVICE_NAME" -n 40 --no-pager || true
else
  echo "ℹ️  User service $SERVICE_NAME not found. Skipping restart."
fi

echo "✅ diet.py replaced (raw‑SQL groceries + fallback) and import OK."
