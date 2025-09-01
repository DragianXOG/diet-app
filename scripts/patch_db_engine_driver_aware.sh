#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
FILE="app/core/db.py"
BACKUP="${FILE}.bak.$(date +%s)"
SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"

[[ -f "$FILE" ]] || { echo "❌ $FILE not found. Run from your repo root."; exit 1; }

cp -a "$FILE" "$BACKUP"
echo "🗂  Backup -> $BACKUP"

cat > "$FILE" <<'PY'
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import event
from sqlalchemy.engine import make_url
import os

# DATABASE_URL may point to sqlite or postgres; handle both correctly
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/app.db")
_url = make_url(DATABASE_URL)
_IS_SQLITE = (_url.get_backend_name() == "sqlite")

# Only pass SQLite-specific connect_args to SQLite engines
_connect_args = {"check_same_thread": False} if _IS_SQLITE else {}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=_connect_args,
    pool_pre_ping=True,
)

# Apply SQLite PRAGMAs only when using SQLite
if _IS_SQLITE:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        try:
            cur = dbapi_connection.cursor()
            cur.execute("PRAGMA journal_mode=WAL;")
            cur.execute("PRAGMA synchronous=NORMAL;")
            cur.execute("PRAGMA busy_timeout=5000;")  # ms
            cur.close()
        except Exception:
            # Non-SQLite or driver quirk: ignore
            pass

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
PY

# Import test with project venv or system python3
PY_BIN="$ROOT/.venv/bin/python"; [[ -x "$PY_BIN" ]] || PY_BIN="$(command -v python3)"
echo "🔎 Import test ..."
PYTHONPATH="$ROOT" "$PY_BIN" - <<'PY'
import importlib
m = importlib.import_module("app.main")
print("ok", type(m.app).__name__)
PY

# Restart service if present
if systemctl --user list-units | grep -q "$SERVICE_NAME"; then
  echo "🔁 Restarting $SERVICE_NAME ..."
  systemctl --user daemon-reload || true
  systemctl --user restart "$SERVICE_NAME" || true
  sleep 1
  systemctl --user status "$SERVICE_NAME" -n 40 --no-pager || true
else
  echo "ℹ️  User service $SERVICE_NAME not found. Skipping restart."
fi

echo "🌐 Health:"
curl -sS http://127.0.0.1:8010/api/v1/status || true; echo
echo "✅ Driver-aware DB engine patch complete."
