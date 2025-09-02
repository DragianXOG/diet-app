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
from sqlalchemy import text, func, inspect as sqla_inspect
from sqlalchemy.exc import OperationalError

from app.core.db import get_session
from app.core.config import settings
from app.core import llm as _llm
# Auth removed in LAN mode
from app.models import (
    User, Intake, Meal, MealItem, WorkoutSession, WorkoutExercise,
    WeightLog, GlucoseLog, MealCheck,
)  # NOTE: avoid GroceryItem mapping to bypass missing cols

import os as _os
from datetime import datetime as _dt
from app.api.auth import get_current_user_session as _sess_user

router = APIRouter()

# ------------------------------------------------------------------------------
# DEV no-auth shim: allow running on trusted LAN without JWTs
# ------------------------------------------------------------------------------
_DEV_NO_AUTH = False  # Enforce login; session-based auth

class _ShimUser:
    def __init__(self, id: int, email: str = "dev@example.com"):
        self.id = id
        self.email = email
        self.created_at = _dt.utcnow()
        self.token_version = 0

def auth_user(user: User = Depends(_sess_user)) -> User:  # session-based
    return user

# ------------------------------------------------------------------------------
# IntakeIn DTO (optional fields)
# ------------------------------------------------------------------------------
class IntakeIn(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    height_in: Optional[int] = None
    weight_lb: Optional[int] = None
    diabetic: Optional[bool] = None
    conditions: Optional[str] = None
    meds: Optional[str] = None
    goals: Optional[str] = None
    zip: Optional[str] = None
    gym: Optional[str] = None
    food_notes: Optional[str] = None
    workout_notes: Optional[str] = None
    meals_per_day: Optional[int] = None
    workout_days_per_week: Optional[int] = None
    workout_session_min: Optional[int] = None
    workout_time: Optional[str] = None
    avoid_ingredients: Optional[str] = None

# ------------------------------------------------------------------------------
# RLS helpers (Postgres set_config pinned to the same connection) + rls_session
# Re-entrant (reference-counted) so nested uses don't RESET too early.
# ------------------------------------------------------------------------------
def _set_rls(session: Session, uid: int) -> None:
    try:
        if session.info.get("_rls_uid") == uid and session.info.get("_rls_depth", 0) > 0:
            return
        conn = session.connection()  # pin the connection
        conn.execute(text("select set_config('app.user_id', :val, false)").bindparams(val=str(uid)))
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
    user: User = Depends(auth_user),
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

def _table_cols(session: Session, table: str) -> set[str]:
    try:
        insp = sqla_inspect(session.connection())
        return {c["name"] for c in insp.get_columns(table)}
    except Exception:
        return set()

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
    user: User = Depends(auth_user),
):
    with _rls(session, user.id):
        q = select(Intake).where(Intake.user_id == user.id)
        if hasattr(Intake, 'created_at'):
            q = q.order_by(getattr(Intake, 'created_at').desc())  # type: ignore[attr-defined]
        intake = session.exec(q).first()
        return intake or {}

@router.post("/intake")
def upsert_intake(
    payload: IntakeIn,
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(auth_user),
):
    with _rls(session, user.id):
        intake = session.exec(select(Intake).where(Intake.user_id == user.id)).first()
        if not intake:
            intake = Intake(user_id=user.id)  # type: ignore[call-arg]
            session.add(intake)
        data = payload.model_dump(exclude_unset=True)
        for fld, val in data.items():
            _safe_set(intake, fld, val)
        session.commit()
        session.refresh(intake)
        return intake

class RationalizeOut(BaseModel):
    diet_label: str
    meals_per_day: int
    times: List[str]
    protein_target: Optional[int] = None
    carb_target: Optional[int] = None
    calorie_target: Optional[int] = None
    safety_required: bool = False
    warnings: List[str] = []

@router.post("/intake/rationalize", response_model=RationalizeOut)
def rationalize_intake(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(auth_user),
):
    with _rls(session, user.id):
        intake = session.exec(select(Intake).where(Intake.user_id == user.id)).first()
        notes = (
            (getattr(intake, "food_notes", "") or "")
            + " "
            + (getattr(intake, "workout_notes", "") or "")
            + " "
            + (getattr(intake, "goals", "") or "")
        )
        notes_l = (notes or "").lower()

        low_carb = any(k in notes_l for k in ("keto", "low carb", "lower carb"))
        if_2 = any(k in notes_l for k in ("if 2/day", "2-meal", "two meals", "16:8"))
        aggressive = any(k in notes_l for k in ("rapid", "aggressive", "very fast"))
        warns: List[str] = []

        # Prefer explicit meals_per_day field when available; else parse notes; else heuristic
        mpd_explicit: Optional[int] = None
        try:
            if intake and getattr(intake, 'meals_per_day', None):
                mpd_explicit = int(getattr(intake, 'meals_per_day'))
        except Exception:
            mpd_explicit = None
        if mpd_explicit is None:
            m = re.search(r"(\d+)\s*(?:-\s*(\d+))?\s*meals?\s*(?:/\s*day)?", notes_l)
            if m:
                a = int(m.group(1))
                b = int(m.group(2)) if m.group(2) else None
                mpd_explicit = max(a, b) if b else a
                mpd_explicit = max(1, min(8, mpd_explicit))

        label = "lower‑carb; IF 16:8 (2/day)" if (low_carb or if_2) else "balanced; 3/day"
        mpd = mpd_explicit if mpd_explicit else (2 if (low_carb or if_2) else 3)

        def _times_for_mpd(n: int) -> List[str]:
            if n == 1:
                return ["12:00"]
            if n == 2:
                return ["12:00", "18:00"]
            if n == 3:
                return ["08:00", "12:00", "18:00"]
            start_minutes = 8 * 60
            end_minutes = 20 * 60
            span = end_minutes - start_minutes
            step = span // (n - 1)
            vals = [start_minutes + i * step for i in range(n)]
            return [f"{v//60:02d}:{v%60:02d}" for v in vals]

        times = _times_for_mpd(mpd)
        protein = 140 if low_carb else 110
        carb = 120 if low_carb else 200

        # Compute calorie target from intake using Mifflin-St Jeor + activity and goal rate
        def _loss_per_week(text: str) -> float | None:
            t = (text or '').lower()
            m = re.search(r"(\\d+(?:\\.\\d+)?)\\s*(lb|pounds?)\\s*(?:per\\s*week|/\\s*week)", t)
            if m:
                try:
                    return float(m.group(1))
                except Exception:
                    return None
            m2 = re.search(r"lose\\s+(\\d+(?:\\.\\d+)?)\\s*(lb|pounds?)\\s*(?:in|over)\\s+(\\d+)\\s*(weeks?|wks?)", t)
            if m2:
                try:
                    total = float(m2.group(1)); weeks = float(m2.group(3))
                    if weeks > 0:
                        return total / weeks
                except Exception:
                    return None
            return None

        def _calorie_target_from_intake(intake_obj) -> Optional[int]:
            try:
                age = int(getattr(intake_obj, 'age', 0) or 0)
                sex = (getattr(intake_obj, 'sex', '') or '').upper()
                height_in = int(getattr(intake_obj, 'height_in', 0) or 0)
                weight_lb = int(getattr(intake_obj, 'weight_lb', 0) or 0)
                if not (age and height_in and weight_lb):
                    return None
                kg = weight_lb * 0.45359237
                cm = height_in * 2.54
                s = 5 if sex == 'M' else (-161 if sex == 'F' else -78)
                bmr = 10*kg + 6.25*cm - 5*age + s
                # Activity from workout days/week
                try:
                    wdw = int(getattr(intake_obj, 'workout_days_per_week', 0) or 0)
                except Exception:
                    wdw = 0
                if wdw <= 0:
                    act = 1.2
                elif wdw <= 2:
                    act = 1.3
                elif wdw <= 4:
                    act = 1.5
                elif wdw <= 6:
                    act = 1.7
                else:
                    act = 1.9
                tdee = bmr * act
                rate = _loss_per_week(getattr(intake_obj, 'goals', '') or notes)
                rate = rate if (isinstance(rate, (int,float)) and rate > 0) else 1.0
                deficit = min(1000.0, max(250.0, rate * 500.0))
                target = int(round(tdee - deficit))
                floor = 1200 if sex == 'F' else 1400
                return max(floor, target)
            except Exception:
                return None

        calorie_target = _calorie_target_from_intake(intake)
        if aggressive:
            warns.append("Aggressive goal pace — consider medical guidance.")
        if getattr(intake, 'diabetic', False) and not low_carb:
            warns.append("Diabetic flag set — consider lower carb options.")

        return RationalizeOut(
            diet_label=label,
            meals_per_day=mpd,
            times=times,
            protein_target=protein,
            carb_target=carb,
            calorie_target=calorie_target,
            safety_required=aggressive,
            warnings=warns,
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
    user: User = Depends(auth_user),
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
    user: User = Depends(auth_user),
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

_RECIPE_BOOK: Dict[str, Dict[str, Any]] = {
    "Grilled Chicken Salad": {
        "tags": {"low_carb", "diabetic", "gluten_free"},
        "ingredients": [
            {"item": "chicken breast", "qty": 6, "unit": "oz"},
            {"item": "mixed greens", "qty": 3, "unit": "cups"},
            {"item": "olive oil", "qty": 1, "unit": "tbsp"},
            {"item": "balsamic vinegar", "qty": 1, "unit": "tbsp"},
            {"item": "avocado", "qty": 0.5, "unit": "each"},
        ],
        "steps": [
            "Season chicken with salt/pepper; grill or pan‑sear 3–4 min/side.",
            "Toss greens with olive oil and balsamic; slice avocado.",
            "Slice chicken; plate over greens with avocado.",
        ],
    },
    "Salmon and Broccoli": {
        "tags": {"low_carb", "diabetic", "pescatarian", "gluten_free"},
        "ingredients": [
            {"item": "salmon", "qty": 6, "unit": "oz"},
            {"item": "broccoli florets", "qty": 2, "unit": "cups"},
            {"item": "olive oil", "qty": 1, "unit": "tbsp"},
            {"item": "lemon", "qty": 0.5, "unit": "each"},
        ],
        "steps": [
            "Roast salmon at 400°F (200°C) for 10–12 min; salt/pepper to taste.",
            "Steam or roast broccoli; drizzle with olive oil and lemon.",
        ],
    },
    "Greek Yogurt Bowl": {
        "tags": {"vegetarian"},
        "ingredients": [
            {"item": "Greek yogurt", "qty": 1, "unit": "cup"},
            {"item": "oats", "qty": 0.25, "unit": "cup"},
            {"item": "berries", "qty": 0.5, "unit": "cup"},
            {"item": "honey", "qty": 1, "unit": "tsp"},
        ],
        "steps": [
            "Mix yogurt with oats; top with berries and drizzle of honey.",
        ],
    },
    "Eggs and Spinach": {
        "tags": {"low_carb", "diabetic", "vegetarian", "gluten_free"},
        "ingredients": [
            {"item": "eggs", "qty": 3, "unit": "each"},
            {"item": "spinach", "qty": 2, "unit": "cups"},
            {"item": "olive oil", "qty": 1, "unit": "tsp"},
        ],
        "steps": [
            "Saute spinach with olive oil until wilted.",
            "Scramble eggs; fold in spinach; season to taste.",
        ],
    },
    "Turkey Lettuce Wraps": {
        "tags": {"low_carb", "diabetic", "gluten_free"},
        "ingredients": [
            {"item": "ground turkey", "qty": 6, "unit": "oz"},
            {"item": "romaine leaves", "qty": 4, "unit": "each"},
            {"item": "soy sauce or tamari", "qty": 1, "unit": "tbsp"},
        ],
        "steps": [
            "Brown turkey; season with soy/tamari.",
            "Spoon into lettuce leaves; add optional veggies/sauce.",
        ],
    },
    "Tofu Stir-Fry": {
        "tags": {"vegetarian"},
        "ingredients": [
            {"item": "firm tofu", "qty": 6, "unit": "oz"},
            {"item": "mixed veg", "qty": 2, "unit": "cups"},
            {"item": "stir-fry sauce", "qty": 2, "unit": "tbsp"},
        ],
        "steps": [
            "Pan-sear tofu cubes; add veg; stir-fry with sauce 3–4 min.",
        ],
    },
    "Quinoa Veggie Bowl": {
        "tags": {"vegetarian"},
        "ingredients": [
            {"item": "quinoa (cooked)", "qty": 1, "unit": "cup"},
            {"item": "roasted veg", "qty": 1, "unit": "cup"},
            {"item": "olive oil", "qty": 1, "unit": "tbsp"},
        ],
        "steps": [
            "Combine quinoa with roasted veg; drizzle olive oil; season.",
        ],
    },
    "Lean Beef + Veg": {
        "tags": {"low_carb", "gluten_free"},
        "ingredients": [
            {"item": "lean ground beef", "qty": 6, "unit": "oz"},
            {"item": "mixed veg", "qty": 2, "unit": "cups"},
        ],
        "steps": [
            "Brown beef; drain; saute veg; combine and season.",
        ],
    },
}

def _make_recipe(title: str) -> Dict[str, Any]:
    rec = _RECIPE_BOOK.get(title)
    if rec:
        return {
            "ingredients": [f"{it['qty']} {it['unit']} {it['item']}" for it in rec.get("ingredients", [])],
            "steps": rec.get("steps", []),
        }
    ing = _fallback_ingredients_from_title(title)
    steps = [
        f"Prep ingredients for {title}.",
        f"Cook {title} and plate.",
    ]
    return {"ingredients": ing, "steps": steps}

def _kcal_for_title(title: str) -> int:
    t = _normalize_name(title)
    # Simple heuristic calorie estimates per serving
    table = {
        'grilled chicken salad': 520,
        'salmon and broccoli': 550,
        'greek yogurt bowl': 380,
        'eggs and spinach': 410,
        'turkey lettuce wraps': 540,
        'tofu stir-fry': 480,
        'quinoa veggie bowl': 520,
        'lean beef + veg': 560,
    }
    for key, val in table.items():
        if key in t:
            return val
    # Fallback default
    return 500

def _default_pairs() -> List[str]:
    return [
        "Grilled Chicken Salad",
        "Salmon and Broccoli",
        "Greek Yogurt Bowl",
        "Eggs and Spinach",
    ]

# Simple recipe bank with tags
_RECIPES: List[Dict[str, Any]] = [
    {"title": "Grilled Chicken Salad", "tags": {"low_carb", "diabetic", "gluten_free"}},
    {"title": "Salmon and Broccoli", "tags": {"low_carb", "diabetic", "pescatarian", "gluten_free"}},
    {"title": "Greek Yogurt Bowl", "tags": {"vegetarian"}},
    {"title": "Eggs and Spinach", "tags": {"low_carb", "diabetic", "vegetarian", "gluten_free"}},
    {"title": "Turkey Lettuce Wraps", "tags": {"low_carb", "diabetic", "gluten_free"}},
    {"title": "Tofu Stir-Fry", "tags": {"vegetarian"}},
    {"title": "Quinoa Veggie Bowl", "tags": {"vegetarian"}},
    {"title": "Lean Beef + Veg", "tags": {"low_carb", "gluten_free"}},
]

def _pick_recipes(intake: Optional[Intake], low_carb: bool, diabetic: bool, avoids: List[str], count: int) -> List[str]:
    def ok(title: str, tags: set[str]) -> bool:
        tnorm = _normalize_name(title)
        if any(a in tnorm for a in avoids):
            return False
        if diabetic and "diabetic" not in tags and low_carb:
            return False
        if low_carb and "low_carb" not in tags:
            return False
        return True

    avoids_norm = [a.strip().lower() for a in avoids if a]
    pool = [r for r in _RECIPES if ok(r["title"], set(r.get("tags") or set()))]
    if not pool:
        pool = _RECIPES[:]
    out: List[str] = []
    i = 0
    while len(out) < count:
        out.append(pool[i % len(pool)]["title"])
        i += 1
    return out

@router.post("/plans/generate")
def generate_plan(
    req: PlanGenerateRequest = Body(...),
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(auth_user),
):
    if req.days <= 0 or req.days > 31:
        raise HTTPException(status_code=400, detail="days must be 1..31")

    start_dt = date.today()
    days: List[Dict[str, Any]] = []

    with _rls(session, user.id):
        # Load intake and interpret preferences/goals
        intake = session.exec(select(Intake).where(Intake.user_id == user.id)).first()
        notes_l = (getattr(intake, 'food_notes', '') + ' ' + getattr(intake, 'workout_notes', '')).lower() if intake else ''
        diabetic_flag = bool(getattr(intake, 'diabetic', False))
        r = rationalize_intake(session=session, user=user)
        meals_per_day = r.meals_per_day if isinstance(r, RationalizeOut) else 2
        times = r.times if isinstance(r, RationalizeOut) else ["12:00", "18:00"]

        # Avoidance keywords from explicit preferences + notes
        avoids: List[str] = []
        # From structured intake (comma-separated)
        try:
            ai = (getattr(intake, 'avoid_ingredients', '') or '')
            for a in str(ai).split(','):
                a = a.strip().lower()
                if a:
                    avoids.append(a)
        except Exception:
            pass
        # From notes (heuristic)
        for key in ["cilantro", "pork", "beef", "dairy", "gluten", "egg", "eggs", "mushroom", "onion", "fish", "seafood", "shellfish", "chicken", "turkey"]:
            if key in notes_l:
                avoids.append(key)
        # Expand broad categories to common synonyms
        expand = {
            'seafood': ['fish','salmon','tuna','shrimp','crab','lobster','scallop'],
            'shellfish': ['shrimp','crab','lobster','scallop'],
            'fish': ['fish','salmon','tuna'],
            'dairy': ['dairy','milk','cheese','yogurt','cream'],
            'eggs': ['egg','eggs'],
            'onions': ['onion','onions','scallion','scallions','green onion'],
            'scallions': ['scallion','scallions','green onion'],
            'mushrooms': ['mushroom','mushrooms'],
            'nuts': ['nut','nuts','peanuts','almonds','walnuts','cashews','tree nuts'],
            'gluten': ['gluten','wheat','bread','pasta'],
            'beef': ['beef'],
            'pork': ['pork'],
            'chicken': ['chicken'],
            'turkey': ['turkey'],
        }
        avoids_expanded: List[str] = []
        for a in avoids:
            avoids_expanded.append(a)
            avoids_expanded.extend(expand.get(a, []))
        # Normalize and de-duplicate
        avoids = sorted(set(a.strip().lower() for a in avoids_expanded if a))

        # If LLM is enabled, attempt LLM-driven plan using PhD Coach logic
        if settings.LLM_ENABLED:
            try:
                kcal_target = getattr(r, 'calorie_target', None) if isinstance(r, RationalizeOut) else None
                plan_llm = _llm.generate_diet_plan(intake=intake, days=req.days, meals_per_day=meals_per_day, avoids=avoids, calorie_target=kcal_target)
            except Exception:
                plan_llm = None
            if plan_llm:
                plan_json = plan_llm
                # Persist minimal meal rows if requested
                if req.persist:
                    for day in plan_json.get('days', []):
                        d = date.fromisoformat(str(day.get('date')))
                        for meal_stub in (day.get('meals') or []):
                            m = Meal(user_id=user.id)  # type: ignore[call-arg]
                            _safe_set(m, "date", d)
                            if hasattr(m, "title"):
                                m.title = meal_stub.get("title") or "Meal"  # type: ignore[attr-defined]
                            elif hasattr(m, "name"):
                                m.name = meal_stub.get("title") or "Meal"  # type: ignore[attr-defined]
                            if hasattr(m, "eaten_at"):
                                try:
                                    tt = time.fromisoformat(meal_stub.get("time") or "12:00")
                                except Exception:
                                    tt = time(12, 0)
                                _safe_set(m, "eaten_at", datetime.combine(d, tt))
                            session.add(m)
                    session.commit()
                return plan_json

        # Choose recipe titles tailored to flags (heuristic fallback)
        titles = _pick_recipes(intake, low_carb=('lower' in r.diet_label.lower() if isinstance(r, RationalizeOut) else False), diabetic=diabetic_flag, avoids=avoids, count=req.days * meals_per_day)

        # Build plan days
        k = 0
        for i in range(req.days):
            d = start_dt + timedelta(days=i)
            day_meals = []
            for j in range(meals_per_day):
                title = titles[k % len(titles)]; k += 1
                rec = _make_recipe(title) if req.include_recipes else None
                # Calorie target per meal: distribute daily target evenly if available
                try:
                    kcal_target = getattr(r, 'calorie_target', None)
                except Exception:
                    kcal_target = None
                per_meal_kcal = int(round((kcal_target or 1800) / max(1, meals_per_day)))
                meal_obj = {"time": times[j % len(times)], "title": title, "kcal": per_meal_kcal}
                if rec:
                    meal_obj.update({"ingredients": rec.get("ingredients"), "steps": rec.get("steps")})
                day_meals.append(meal_obj)
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
            "window": {"start": str(start_dt), "end": str(start_dt + timedelta(days=req.days - 1))},
        }
        with (plans_dir / f"{start_dt}.json").open("w", encoding="utf-8") as f:
            json.dump(plan_json, f, ensure_ascii=False, indent=2)

    return plan_json

@router.get("/plans")
def list_plans(
    *,
    user: User = Depends(auth_user),
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
    user: User = Depends(auth_user),
):
    fp = Path(f"data/plans/user-{user.id}/{start}.json")
    if not fp.exists():
        raise HTTPException(status_code=404, detail="Plan not found")
    with fp.open("r", encoding="utf-8") as f:
        return json.load(f)

# ------------------------------------------------------------------------------
# Workouts: generate weekly plan based on intake; list and track completion
# ------------------------------------------------------------------------------
class WorkoutGenerateRequest(BaseModel):
    days: int = 7
    persist: bool = True

def _equipment_from_notes(intake: Optional[Intake]) -> Dict[str, bool]:
    txt = ((getattr(intake, 'workout_notes', '') or '') + ' ' + (getattr(intake, 'goals', '') or '')).lower()
    return {
      'dumbbells': any(k in txt for k in ['dumbbell','db']),
      'bands': 'band' in txt,
      'smith': 'smith' in txt,
      'machines': any(k in txt for k in ['machine','gym','planet fitness','la fitness','crunch']),
      'home': 'home' in txt,
      'yoga': 'yoga' in txt,
    }

def _sessions_per_week(intake: Optional[Intake]) -> int:
    try:
        v = int(getattr(intake, 'workout_days_per_week', None) or 0)
        if v:
            return max(1, min(7, v))
    except Exception:
        pass
    txt = ((getattr(intake, 'workout_notes', '') or '') + ' ' + (getattr(intake, 'goals', '') or '')).lower()
    m = re.search(r"(\d+)\s*(?:-\s*(\d+))?\s*(?:days|sessions)\s*(?:/\s*week)?", txt)
    if m:
        a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else None
        return max(1, min(7, max(a, b) if b else a))
    return 4

def _session_minutes(intake: Optional[Intake]) -> int:
    try:
        v = int(getattr(intake, 'workout_session_min', None) or 0)
        if v:
            return max(15, min(120, v))
    except Exception:
        pass
    txt = ((getattr(intake, 'workout_notes', '') or '') + ' ' + (getattr(intake, 'goals', '') or '')).lower()
    m = re.search(r"(\d+)\s*min", txt)
    if m:
        return max(15, min(120, int(m.group(1))))
    return 45

def _build_day_template(eq: Dict[str,bool], day_index: int) -> List[Dict[str, Any]]:
    # Simple split: 0 Upper, 1 Lower, 2 Push, 3 Pull, 4 Core/Conditioning, repeat
    mod = day_index % 5
    out: List[Dict[str, Any]] = []
    def ex(name, machine=None, sets=3, reps=12, tw=None, rest=60):
        return { 'name': name, 'machine': machine, 'sets': sets, 'reps': reps, 'target_weight': tw, 'rest_sec': rest }
    if mod == 0:  # Upper
        if eq['machines'] or eq['smith']:
            out += [ex('Lat Pulldown', 'Lat Pulldown'), ex('Seated Row', 'Row Machine'), ex('Shoulder Press', 'Machine Press')]
        else:
            out += [ex('DB Bench Press','Dumbbells'), ex('One-Arm DB Row','Dumbbells'), ex('DB Shoulder Press','Dumbbells')]
    elif mod == 1:  # Lower
        if eq['smith']:
            out += [ex('Smith Squat','Smith Machine', sets=4, reps=10), ex('Smith RDL','Smith Machine'), ex('Leg Press','Leg Press')]
        elif eq['machines']:
            out += [ex('Leg Press','Leg Press'), ex('Leg Curl','Hamstring Curl'), ex('Leg Extension','Quad Extension')]
        else:
            out += [ex('Goblet Squat','Dumbbells'), ex('DB RDL','Dumbbells'), ex('Reverse Lunge','Bodyweight/Dumbbells')]
    elif mod == 2:  # Push
        out += [ex('Incline Press','Machine/Dumbbells'), ex('Lateral Raise','Dumbbells'), ex('Triceps Pushdown','Cable')]
    elif mod == 3:  # Pull
        out += [ex('Assisted Pull-Up','Assisted Pull-Up'), ex('Cable Row','Row Machine'), ex('Biceps Curl','Cable/Dumbbells')]
    else:  # Core/Conditioning
        out += [ex('Plank','Mat', sets=3, reps=45, tw=None, rest=45), ex('Cable Woodchop','Cable', sets=3, reps=12), ex('Farmer Carry','Dumbbells', sets=4, reps=40)]
    return out

@router.post('/workouts/generate')
def generate_workouts(
    req: WorkoutGenerateRequest = Body(...),
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(auth_user),
):
    if req.days <= 0 or req.days > 31:
        raise HTTPException(status_code=400, detail='days must be 1..31')
    start_dt = date.today()
    with _rls(session, user.id):
        intake = session.exec(select(Intake).where(Intake.user_id == user.id)).first()
        eq = _equipment_from_notes(intake)
        per_week = _sessions_per_week(intake)
        minutes = _session_minutes(intake)
        made = 0
        sessions: List[Dict[str, Any]] = []

        if settings.LLM_ENABLED:
            # Use LLM stub to produce plan-shaped output
            llm_sessions = _llm.generate_workout_plan(intake=intake, days=req.days, per_week=per_week, minutes=minutes, equipment=eq)
            for s in llm_sessions:
                d = date.fromisoformat(s['date'])
                tmpl = s.get('exercises') or []
                tstr = (getattr(intake, 'workout_time', None) or '06:00')
                try:
                    tt = time.fromisoformat(tstr)
                except Exception:
                    tt = time(6,0)
                sess = WorkoutSession(user_id=user.id, date=datetime.combine(d, tt), title=s.get('title') or 'Workout', location=(getattr(intake,'gym',None) or ('Home' if eq.get('home') else None)))
                if req.persist:
                    session.add(sess)
                    session.flush()
                    for j, e in enumerate(tmpl):
                        we = WorkoutExercise(session_id=sess.id, order_index=j, name=e.get('name'), machine=e.get('machine'), sets=e.get('sets'), reps=e.get('reps'), target_weight=e.get('target_weight'), rest_sec=e.get('rest_sec'))
                        session.add(we)
                    made += 1
                sessions.append({ 'date': str(d), 'title': sess.title, 'exercises': tmpl })
        else:
            # Heuristic fallback
            # Derive session indices across the requested window
            day_indices = list(range(req.days))
            if per_week < req.days:
                step = req.days / per_week
                # pick evenly spaced indices
                picks = []
                for i in range(per_week):
                    x = int(round(i * step))
                    if x >= req.days: x = req.days - 1
                    if x not in picks:
                        picks.append(x)
                day_indices = picks
            for i in day_indices:
                d = start_dt + timedelta(days=i)
                tmpl = _build_day_template(eq, i)
                if minutes <= 30 and len(tmpl) > 3:
                    tmpl = tmpl[:3]
                tstr = (getattr(intake, 'workout_time', None) or '06:00')
                try:
                    tt = time.fromisoformat(tstr)
                except Exception:
                    tt = time(6,0)
                sess = WorkoutSession(user_id=user.id, date=datetime.combine(d, tt), title=['Upper','Lower','Push','Pull','Core'][i%5], location=(getattr(intake,'gym',None) or ('Home' if eq['home'] else None)))
                if req.persist:
                    session.add(sess)
                    session.flush()
                    for j, e in enumerate(tmpl):
                        we = WorkoutExercise(session_id=sess.id, order_index=j, name=e['name'], machine=e.get('machine'), sets=e.get('sets'), reps=e.get('reps'), target_weight=e.get('target_weight'), rest_sec=e.get('rest_sec'))
                        session.add(we)
                    made += 1
                sessions.append({ 'date': str(d), 'title': sess.title, 'exercises': tmpl })
        if req.persist:
            session.commit()
    return { 'created': made, 'start': str(start_dt), 'days': sessions }

@router.get('/workouts')
def list_workouts(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(auth_user),
    start: Optional[date] = Query(None), end: Optional[date] = Query(None),
):
    with _rls(session, user.id):
        q = select(WorkoutSession).where(WorkoutSession.user_id == user.id)
        if start: q = q.where(func.date(WorkoutSession.date) >= start)
        if end: q = q.where(func.date(WorkoutSession.date) <= end)
        q = q.order_by(WorkoutSession.date)
        sessions = session.exec(q).all()
        out = []
        for s in sessions:
            exs = session.exec(select(WorkoutExercise).where(WorkoutExercise.session_id == s.id).order_by(WorkoutExercise.order_index)).all()
            out.append({
              'id': s.id,
              'date': s.date.date().isoformat(),
              'title': s.title,
              'location': s.location,
              'exercises': [
                {
                  'id': e.id, 'name': e.name, 'machine': e.machine,
                  'sets': e.sets, 'reps': e.reps, 'target_weight': e.target_weight,
                  'rest_sec': e.rest_sec, 'complete': e.complete,
                  'actual_reps': e.actual_reps, 'actual_weight': e.actual_weight,
                } for e in exs
              ]
            })
        return out

class ExerciseUpdate(BaseModel):
    complete: Optional[bool] = None
    actual_reps: Optional[int] = None
    actual_weight: Optional[int] = None

@router.patch('/workouts/exercises/{exercise_id}')
def update_exercise(
    exercise_id: int, payload: ExerciseUpdate,
    *, session: Session = Depends(rls_session), user: User = Depends(auth_user),
):
    with _rls(session, user.id):
        e = session.get(WorkoutExercise, exercise_id)
        if not e:
            raise HTTPException(status_code=404, detail='Exercise not found')
        if payload.complete is not None:
            e.complete = bool(payload.complete)
        if payload.actual_reps is not None:
            e.actual_reps = int(payload.actual_reps)
        if payload.actual_weight is not None:
            e.actual_weight = int(payload.actual_weight)
        session.add(e)
        session.commit()
        session.refresh(e)
        return { 'ok': True, 'id': e.id, 'complete': e.complete, 'actual_reps': e.actual_reps, 'actual_weight': e.actual_weight }

# ------------------------------------------------------------------------------
# Trackers: weight & glucose; Meal checklist + summary
# ------------------------------------------------------------------------------
class WeightIn(BaseModel):
    when: Optional[datetime] = None
    weight_lb: int

@router.get('/trackers/weight')
def list_weight(*, session: Session = Depends(rls_session), user: User = Depends(auth_user), limit: int = 30):
    with _rls(session, user.id):
        q = select(WeightLog).where(WeightLog.user_id == user.id).order_by(WeightLog.when.desc()).limit(limit)
        rows = session.exec(q).all()
        return [{ 'id': r.id, 'when': r.when.isoformat(), 'weight_lb': r.weight_lb } for r in rows]

@router.post('/trackers/weight')
def add_weight(payload: WeightIn, *, session: Session = Depends(rls_session), user: User = Depends(auth_user)):
    with _rls(session, user.id):
        wl = WeightLog(user_id=user.id, when=payload.when or datetime.utcnow(), weight_lb=int(payload.weight_lb))
        session.add(wl)
        session.commit()
        session.refresh(wl)
        return { 'id': wl.id, 'when': wl.when.isoformat(), 'weight_lb': wl.weight_lb }

class GlucoseIn(BaseModel):
    when: Optional[datetime] = None
    mg_dL: int

@router.get('/trackers/glucose')
def list_glucose(*, session: Session = Depends(rls_session), user: User = Depends(auth_user), limit: int = 30):
    with _rls(session, user.id):
        q = select(GlucoseLog).where(GlucoseLog.user_id == user.id).order_by(GlucoseLog.when.desc()).limit(limit)
        rows = session.exec(q).all()
        return [{ 'id': r.id, 'when': r.when.isoformat(), 'mg_dL': r.mg_dL } for r in rows]

@router.post('/trackers/glucose')
def add_glucose(payload: GlucoseIn, *, session: Session = Depends(rls_session), user: User = Depends(auth_user)):
    with _rls(session, user.id):
        gl = GlucoseLog(user_id=user.id, when=payload.when or datetime.utcnow(), mg_dL=int(payload.mg_dL))
        session.add(gl)
        session.commit()
        session.refresh(gl)
        return { 'id': gl.id, 'when': gl.when.isoformat(), 'mg_dL': gl.mg_dL }

class MealCheckIn(BaseModel):
    date: date
    title: str
    complete: bool = True

@router.get('/checklists/meals')
def list_meal_checks(*, session: Session = Depends(rls_session), user: User = Depends(auth_user), start: Optional[date] = Query(None), end: Optional[date] = Query(None)):
    with _rls(session, user.id):
        q = select(MealCheck).where(MealCheck.user_id == user.id)
        if start: q = q.where(func.date(MealCheck.date) >= start)
        if end: q = q.where(func.date(MealCheck.date) <= end)
        q = q.order_by(MealCheck.date)
        rows = session.exec(q).all()
        return [{ 'id': r.id, 'date': r.date.date().isoformat(), 'title': r.title, 'complete': r.complete } for r in rows]

@router.post('/checklists/meals')
def mark_meal_check(payload: MealCheckIn, *, session: Session = Depends(rls_session), user: User = Depends(auth_user)):
    with _rls(session, user.id):
        d = datetime.combine(payload.date, time(12,0))
        row = session.exec(select(MealCheck).where(MealCheck.user_id == user.id, func.date(MealCheck.date) == payload.date, MealCheck.title == payload.title)).first()
        if not row:
            row = MealCheck(user_id=user.id, date=d, title=payload.title, complete=bool(payload.complete), completed_at=(datetime.utcnow() if payload.complete else None))
        else:
            row.complete = bool(payload.complete)
            row.completed_at = datetime.utcnow() if payload.complete else None
        session.add(row)
        session.commit()
        session.refresh(row)
        return { 'id': row.id, 'date': row.date.date().isoformat(), 'title': row.title, 'complete': row.complete }

@router.get('/checklists/summary')
def checklists_summary(*, session: Session = Depends(rls_session), user: User = Depends(auth_user), start: Optional[date] = Query(None), end: Optional[date] = Query(None)):
    with _rls(session, user.id):
        # Meals (from checks)
        mq = select(MealCheck).where(MealCheck.user_id == user.id)
        if start: mq = mq.where(func.date(MealCheck.date) >= start)
        if end: mq = mq.where(func.date(MealCheck.date) <= end)
        mrows = session.exec(mq).all()
        meals_total = len(mrows)
        meals_done = sum(1 for r in mrows if r.complete)

        # Workouts (exercises complete)
        wq = select(WorkoutSession).where(WorkoutSession.user_id == user.id)
        if start: wq = wq.where(func.date(WorkoutSession.date) >= start)
        if end: wq = wq.where(func.date(WorkoutSession.date) <= end)
        sess = session.exec(wq).all()
        ex_total = 0
        ex_done = 0
        for s in sess:
            exs = session.exec(select(WorkoutExercise).where(WorkoutExercise.session_id == s.id)).all()
            ex_total += len(exs)
            ex_done += sum(1 for e in exs if e.complete)

        # Groceries (open vs purchased)
        try:
            rows = session.exec(text("SELECT COUNT(*) FILTER (WHERE COALESCE(purchased,false)=false), COUNT(*) FILTER (WHERE COALESCE(purchased,false)=true) FROM grocery_items WHERE user_id=:uid").bindparams(uid=user.id)).first()
            gro_open = int(rows[0]) if rows else 0
            gro_purch = int(rows[1]) if rows else 0
        except Exception:
            gro_open = gro_purch = 0

        return {
          'meals': { 'total': meals_total, 'completed': meals_done },
          'workouts': { 'exercises_total': ex_total, 'completed': ex_done },
          'groceries': { 'open': gro_open, 'purchased': gro_purch },
        }

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
    user: User = Depends(auth_user),
):
    with _rls(session, user.id):
        cols = _table_cols(session, "grocery_items")
        if {"created_at", "updated_at"} <= cols:
            stmt = text("""
                INSERT INTO grocery_items (user_id, name, quantity, unit, purchased, created_at, updated_at)
                VALUES (:uid, :name, :qty, NULL, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id, user_id, name, quantity, unit, purchased
            """).bindparams(uid=user.id, name=item.name, qty=float(item.quantity or 1.0))
        else:
            stmt = text("""
                INSERT INTO grocery_items (user_id, name, quantity, unit, purchased)
                VALUES (:uid, :name, :qty, NULL, false)
                RETURNING id, user_id, name, quantity, unit, purchased
            """).bindparams(uid=user.id, name=item.name, qty=float(item.quantity or 1.0))
        res = session.exec(stmt)
        session.commit()
        row = res.mappings().first()
        return dict(row) if row else {"ok": True}

@router.get("/groceries")
def list_groceries(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(auth_user),
    only_open: bool = Query(False, description="Show only items not yet purchased"),
):
    with _rls(session, user.id):
        sql = """
            SELECT id, user_id, name, quantity, unit, purchased
            FROM grocery_items
            WHERE user_id = :uid
        """
        if only_open:
            sql += " AND COALESCE(purchased, false) = false"
        sql += " ORDER BY id"
        stmt = text(sql).bindparams(uid=user.id)
        rows = session.exec(stmt).mappings().all()
        return [dict(r) for r in rows]

@router.patch("/groceries/{item_id}")
def toggle_grocery_purchased(
    item_id: int,
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(auth_user),
):
    with _rls(session, user.id):
        cols = _table_cols(session, "grocery_items")
        sel = text("SELECT purchased FROM grocery_items WHERE id=:id AND user_id=:uid").bindparams(id=item_id, uid=user.id)
        row = session.exec(sel).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Grocery item not found")
        current = bool(row[0])
        if "updated_at" in cols:
            upd = text("UPDATE grocery_items SET purchased=:p, updated_at=CURRENT_TIMESTAMP WHERE id=:id AND user_id=:uid") \
                .bindparams(p=not current, id=item_id, uid=user.id)
        else:
            upd = text("UPDATE grocery_items SET purchased=:p WHERE id=:id AND user_id=:uid") \
                .bindparams(p=not current, id=item_id, uid=user.id)
        session.exec(upd)
        session.commit()
        sel2 = text("SELECT id, user_id, name, quantity, unit, purchased FROM grocery_items WHERE id=:id AND user_id=:uid") \
            .bindparams(id=item_id, uid=user.id)
        row2 = session.exec(sel2).mappings().first()
        return dict(row2) if row2 else {"id": item_id, "purchased": not current}

@router.post("/groceries/sync_from_meals")
def sync_groceries_from_meals(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(auth_user),
    start: date = Query(..., description="YYYY-MM-DD"),
    end: date = Query(..., description="YYYY-MM-DD"),
    persist: bool = Query(True),
    clear_existing: bool = Query(True),
    seed_if_empty: bool = Query(
        True,
        description="If no meals exist in window, seed a default 7-day, 2-meals/day plan (and persist meals when persist=true).",
    ),
):
    with _rls(session, user.id):
        cols = _table_cols(session, "grocery_items")

        if clear_existing:
            if "updated_at" in cols:
                del_stmt = text("DELETE FROM grocery_items WHERE user_id=:uid AND purchased=false") \
                    .bindparams(uid=user.id)
            else:
                del_stmt = text("DELETE FROM grocery_items WHERE user_id=:uid AND purchased=false") \
                    .bindparams(uid=user.id)
            session.exec(del_stmt)
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
                sel = text("""
                    SELECT id, quantity
                    FROM grocery_items
                    WHERE user_id=:uid AND name=:nm AND purchased=false
                    LIMIT 1
                """).bindparams(uid=user.id, nm=nm)
                row = session.exec(sel).mappings().first()
                if row:
                    # Idempotent: set to computed quantity instead of incrementing
                    if "updated_at" in cols:
                        upd = text("""
                            UPDATE grocery_items
                            SET quantity = :qty,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id=:id
                        """).bindparams(qty=float(qty), id=row["id"])
                    else:
                        upd = text("UPDATE grocery_items SET quantity = :qty WHERE id=:id") \
                            .bindparams(qty=float(qty), id=row["id"])
                    session.exec(upd)
                else:
                    if {"created_at", "updated_at"} <= cols:
                        ins = text("""
                            INSERT INTO grocery_items (user_id, name, quantity, unit, purchased, created_at, updated_at)
                            VALUES (:uid, :nm, :qty, NULL, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """).bindparams(uid=user.id, nm=nm, qty=float(qty))
                    elif "created_at" in cols:  # rare case: only created_at enforced
                        ins = text("""
                            INSERT INTO grocery_items (user_id, name, quantity, unit, purchased, created_at)
                            VALUES (:uid, :nm, :qty, NULL, false, CURRENT_TIMESTAMP)
                        """).bindparams(uid=user.id, nm=nm, qty=float(qty))
                    else:
                        ins = text("""
                            INSERT INTO grocery_items (user_id, name, quantity, unit, purchased)
                            VALUES (:uid, :nm, :qty, NULL, false)
                        """).bindparams(uid=user.id, nm=nm, qty=float(qty))
                    session.exec(ins)
                    created += 1
            session.commit()

        return {"created": created, "count": len(name_counts), "window": {"start": str(start), "end": str(end)}}

@router.get("/groceries/price_preview")
def price_preview(
    *,
    session: Session = Depends(rls_session),
    user: User = Depends(auth_user),
):
    with _rls(session, user.id):
        sel = text("""
            SELECT id, name, quantity
            FROM grocery_items
            WHERE user_id=:uid AND purchased=false
            ORDER BY id
        """).bindparams(uid=user.id)
        rows = session.exec(sel).mappings().all()

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
    user: User = Depends(auth_user),
):
    with _rls(session, user.id):
        prev = price_preview(session=session, user=user)
        items: List[Dict[str, Any]] = prev["items"]
        meta: Dict[str, Any] = {"backend": "db"}
        updated = 0
        try:
            cols = _table_cols(session, "grocery_items")
            if "updated_at" in cols:
                for stub in items:
                    upd = text("""
                        UPDATE grocery_items
                        SET store=:s, unit_price=:u, total_price=:t, updated_at=CURRENT_TIMESTAMP
                        WHERE id=:id AND user_id=:uid
                    """).bindparams(
                        s=stub["suggested_store"],
                        u=float(stub["unit_price"]),
                        t=float(stub["total_price"]),
                        id=stub["id"],
                        uid=user.id,
                    )
                    session.exec(upd)
                    updated += 1
            else:
                for stub in items:
                    upd = text("""
                        UPDATE grocery_items
                        SET store=:s, unit_price=:u, total_price=:t
                        WHERE id=:id AND user_id=:uid
                    """).bindparams(
                        s=stub["suggested_store"],
                        u=float(stub["unit_price"]),
                        t=float(stub["total_price"]),
                        id=stub["id"],
                        uid=user.id,
                    )
                    session.exec(upd)
                    updated += 1
            session.commit()
        except Exception:
            meta = _persist_prices_fallback(user.id, items)
            updated = len(items)
        return {"updated": updated, "totals": prev["totals"], "grand_total": prev["grand_total"], "persist": meta}
