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
    # enforce uniqueness at DB level
    email: str = Field(
        sa_column=sa.Column(sa.String(254), unique=True, index=True, nullable=False)
    )
    password_hash: str = Field(nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
