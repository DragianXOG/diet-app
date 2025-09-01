from datetime import datetime
from typing import Optional
import sqlalchemy as sa
from sqlmodel import SQLModel, Field

class Ping(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    msg: str
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

class User(SQLModel, table=True):
    __tablename__ = "users"
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(sa_column=sa.Column(sa.String(254), unique=True, index=True, nullable=False))
    password_hash: str = Field(nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    # Used for server-side token revocation (logout bumps this)
    token_version: int = Field(default=0, sa_column=sa.Column(sa.Integer, nullable=False))

class Intake(SQLModel, table=True):
    food_notes: Optional[str] = Field(default=None)
    workout_notes: Optional[str] = Field(default=None)
    __tablename__ = "intakes"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=sa.Column(
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )
    )
    name: Optional[str] = Field(default=None)
    age: Optional[int] = Field(default=None)
    sex: Optional[str] = Field(default=None)
    height_in: Optional[int] = Field(default=None)
    weight_lb: Optional[int] = Field(default=None)
    diabetic: Optional[bool] = Field(default=None)
    conditions: Optional[str] = Field(default=None)
    meds: Optional[str] = Field(default=None)
    goals: Optional[str] = Field(default=None)
    # Optional explicit meals/day preference (2-6 typical)
    meals_per_day: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer))
    zip: Optional[str] = Field(default=None)
    gym: Optional[str] = Field(default=None)
    # Workout preferences
    workout_days_per_week: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer))
    workout_session_min: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer))
    workout_time: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(8)))
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=sa.Column(sa.DateTime, nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=sa.Column(sa.DateTime, nullable=False)
    )

class Meal(SQLModel, table=True):
    __tablename__ = "meals"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=sa.Column(sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False))
    name: str = Field(sa_column=sa.Column(sa.String(120), nullable=False))
    eaten_at: datetime = Field(default_factory=datetime.utcnow, sa_column=sa.Column(sa.DateTime, index=True, nullable=False))
    total_calories: Optional[int] = Field(default=None)

class MealItem(SQLModel, table=True):
    __tablename__ = "meal_items"
    id: Optional[int] = Field(default=None, primary_key=True)
    meal_id: int = Field(sa_column=sa.Column(sa.Integer, sa.ForeignKey("meals.id", ondelete="CASCADE"), index=True, nullable=False))
    name: str = Field(sa_column=sa.Column(sa.String(120), nullable=False))
    calories: Optional[int] = Field(default=None)
    quantity: Optional[float] = Field(default=None)
    unit: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(24)))


class GroceryItem(SQLModel, table=True):
    __tablename__ = "grocery_items"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=sa.Column(
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )
    )
    name: str = Field(sa_column=sa.Column(sa.String(120), nullable=False))
    quantity: Optional[float] = Field(default=None)
    unit: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(24)))
    # ✅ New optional pricing + store fields
    store: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(120)))
    unit_price: Optional[float] = Field(default=None, sa_column=sa.Column(sa.Float))
    total_price: Optional[float] = Field(default=None, sa_column=sa.Column(sa.Float))

    purchased: bool = Field(
        default=False, sa_column=sa.Column(sa.Boolean, index=True, nullable=False)
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=sa.Column(sa.DateTime, index=True, nullable=False),
    )

# --- Workouts ---
class WorkoutSession(SQLModel, table=True):
    __tablename__ = "workout_sessions"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=sa.Column(sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False))
    date: datetime = Field(default_factory=datetime.utcnow, sa_column=sa.Column(sa.DateTime, index=True, nullable=False))
    title: str = Field(sa_column=sa.Column(sa.String(160), nullable=False))
    location: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(120)))
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column=sa.Column(sa.DateTime, nullable=False))

class WorkoutExercise(SQLModel, table=True):
    __tablename__ = "workout_exercises"
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(sa_column=sa.Column(sa.Integer, sa.ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True, nullable=False))
    order_index: int = Field(default=0, sa_column=sa.Column(sa.Integer, nullable=False))
    name: str = Field(sa_column=sa.Column(sa.String(160), nullable=False))
    machine: Optional[str] = Field(default=None, sa_column=sa.Column(sa.String(160)))
    sets: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer))
    reps: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer))
    target_weight: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer))
    rest_sec: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer))
    complete: bool = Field(default=False, sa_column=sa.Column(sa.Boolean, index=True, nullable=False))
    actual_reps: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer))
    actual_weight: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer))
