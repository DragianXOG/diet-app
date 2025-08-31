import os
from sqlmodel import SQLModel, create_engine, Session

# Ensure data dir exists
os.makedirs("data", exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/app.db")
engine = create_engine(DATABASE_URL, echo=False)

def init_db() -> None:
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine, expire_on_commit=False) as session:
        yield session
