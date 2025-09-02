from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy.engine import make_url
import os

# Require Postgres in this environment
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required and must point to Postgres (e.g. postgresql+psycopg://user:pass@host/db)."
    )

_url = make_url(DATABASE_URL)
_backend = _url.get_backend_name()
if not _backend.startswith("postgres"):
    raise RuntimeError(
        f"Unsupported database backend '{_backend}'. This deployment is Postgres-only."
    )

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

def get_session():
    with Session(engine) as session:
        yield session

def init_db() -> None:
    """
    Compatibility shim used by app.main. Safe to call multiple times.
    Ensures models are registered and tables exist.
    """
    try:
        import app.models  # noqa: F401
    except Exception:
        pass
    try:
        SQLModel.metadata.create_all(engine)
    except Exception:
        # Don't crash app startup due to init; logs will show details.
        pass
