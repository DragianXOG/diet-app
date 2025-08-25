from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class Ping(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    msg: str
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
