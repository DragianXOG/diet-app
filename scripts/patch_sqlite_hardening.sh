#!/usr/bin/env bash
set -euo pipefail

# Run this from your repo root (directory containing app/ and requirements.txt)
ROOT="$(pwd)"
SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"

echo "📁 Repo root: $ROOT"

# Ensure venv & deps (FastAPI/SQLModel) are present so we can import-test later
if ! command -v python3 >/dev/null 2>&1; then
  echo "🔧 Installing python3 ..."
  sudo apt-get update -y
  sudo apt-get install -y python3
fi
if [[ ! -x ".venv/bin/python" ]]; then
  if ! dpkg -s python3-venv >/dev/null 2>&1; then
    echo "🔧 Installing python3-venv ..."
    sudo apt-get update -y
    sudo apt-get install -y python3-venv
  fi
  echo "🐍 Creating virtualenv at .venv ..."
  python3 -m venv .venv
fi
. .venv/bin/activate
python -m pip install -U pip wheel >/dev/null
if [[ -f requirements.txt ]]; then
  echo "📦 Installing requirements.txt ..."
  python -m pip install -r requirements.txt
else
  echo "📦 Installing minimal backend deps ..."
  python -m pip install 'fastapi==0.115.0' 'uvicorn[standard]' 'sqlmodel==0.0.22' 'pydantic>=1,<3' 'python-jose[cryptography]' 'passlib[bcrypt]'
fi
deactivate

# Backup and harden app/core/db.py
DB_FILE="app/core/db.py"
[[ -f "$DB_FILE" ]] || { echo "❌ $DB_FILE not found"; exit 1; }
BACKUP="$DB_FILE.bak.$(date +%s)"
cp -a "$DB_FILE" "$BACKUP"
echo "🗂  Backup of $DB_FILE -> $BACKUP"

cat > "$DB_FILE" <<'PY'
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import event
import os

# Use env override if provided; default to local SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/app.db")

# SQLite thread-safety + pool health
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)

# Apply robust SQLite PRAGMAs per-connection
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    try:
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA synchronous=NORMAL;")
        cur.execute("PRAGMA busy_timeout=5000;")  # ms
        cur.close()
    except Exception:
        # Non-SQLite dialects or failures: ignore
        pass

def get_session():
    # Dependency for FastAPI endpoints
    with Session(engine) as session:
        yield session
PY

echo "🔎 Import test (venv)..."
PYTHONPATH="$ROOT" "$ROOT/.venv/bin/python" - <<'PY'
import importlib
m = importlib.import_module("app.main")
print("ok", type(m.app).__name__)
PY

# Restart systemd user service (if present)
if systemctl --user list-units | grep -q "$SERVICE_NAME"; then
  echo "🔁 Restarting $SERVICE_NAME ..."
  systemctl --user daemon-reload || true
  systemctl --user restart "$SERVICE_NAME"
  sleep 1
  systemctl --user status "$SERVICE_NAME" -n 50 --no-pager || true
else
  echo "ℹ️  User service $SERVICE_NAME not found. Skipping restart."
fi

echo "🌐 Health: GET /api/v1/status"
if command -v curl >/dev/null 2>&1; then
  curl -sS http://127.0.0.1:8010/api/v1/status || true
  echo
fi

echo "✅ SQLite hardening patch complete."
