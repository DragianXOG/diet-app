from typing import List, Optional, Dict
from datetime import datetime
from pydantic import BaseModel, conint, confloat
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User, Meal, MealItem, GroceryItem

router = APIRouter()

# ---------- Meals ----------
class MealItemIn(BaseModel):
    name: str
    calories: Optional[conint(ge=0)] = None
    quantity: Optional[confloat(ge=0)] = None
    unit: Optional[str] = None

class MealCreate(BaseModel):
    name: str
    eaten_at: Optional[datetime] = None
    items: List[MealItemIn] = []

@router.post("/meals", status_code=201)
def create_meal(payload: MealCreate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    meal = Meal(
        user_id=user.id,
        name=payload.name,
        eaten_at=payload.eaten_at or datetime.utcnow(),
        total_calories=(sum(i.calories or 0 for i in payload.items) if payload.items else None),
    )
    session.add(meal)
    session.commit()
    session.refresh(meal)

    for it in payload.items:
        mi = MealItem(meal_id=meal.id, name=it.name, calories=it.calories, quantity=it.quantity, unit=it.unit)
        session.add(mi)
    session.commit()

    return {"id": meal.id, "name": meal.name, "eaten_at": meal.eaten_at.isoformat(), "total_calories": meal.total_calories, "items": len(payload.items)}

@router.get("/meals")
def list_meals(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    limit: int = Query(10, ge=1, le=100),
):
    meals = session.exec(
        select(Meal).where(Meal.user_id == user.id).order_by(Meal.eaten_at.desc()).limit(limit)
    ).all()
    if not meals:
        return []
    meal_ids = [m.id for m in meals]
    items = session.exec(select(MealItem).where(MealItem.meal_id.in_(meal_ids))).all()
    by_meal: Dict[int, List[MealItem]] = {}
    for it in items:
        by_meal.setdefault(it.meal_id, []).append(it)
    out = []
    for m in meals:
        out.append({
            "id": m.id,
            "name": m.name,
            "eaten_at": m.eaten_at.isoformat(),
            "total_calories": m.total_calories,
            "items": [{"name": it.name, "calories": it.calories, "qty": it.quantity, "unit": it.unit} for it in by_meal.get(m.id, [])]
        })
    return out

# ---------- Groceries ----------
class GroceryIn(BaseModel):
    name: str
    quantity: Optional[confloat(ge=0)] = None
    unit: Optional[str] = None

class GroceryUpdate(BaseModel):
    purchased: bool

@router.post("/groceries", status_code=201)
def add_grocery(payload: GroceryIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    g = GroceryItem(user_id=user.id, name=payload.name, quantity=payload.quantity, unit=payload.unit, purchased=False)
    session.add(g)
    session.commit()
    session.refresh(g)
    return {"id": g.id, "name": g.name, "quantity": g.quantity, "unit": g.unit, "purchased": g.purchased}

@router.get("/groceries")
def list_groceries(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    only_open: bool = Query(True),
):
    q = select(GroceryItem).where(GroceryItem.user_id == user.id)
    if only_open:
        q = q.where(GroceryItem.purchased == False)  # noqa: E712
    rows = session.exec(q.order_by(GroceryItem.created_at.desc())).all()
    return [{"id": r.id, "name": r.name, "quantity": r.quantity, "unit": r.unit, "purchased": r.purchased, "created_at": r.created_at.isoformat()} for r in rows]

@router.patch("/groceries/{item_id}")
def update_grocery(item_id: int, payload: GroceryUpdate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    g = session.get(GroceryItem, item_id)
    if not g or g.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found")
    g.purchased = payload.purchased
    session.add(g)
    session.commit()
    session.refresh(g)
    return {"id": g.id, "name": g.name, "purchased": g.purchased}
