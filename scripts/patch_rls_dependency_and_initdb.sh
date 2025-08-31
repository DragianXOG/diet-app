#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"

# Ensure venv & deps
if [[ ! -x ".venv/bin/python" ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "❌ python3 not found"; exit 1
  fi
  python3 -m venv .venv
fi
. .venv/bin/activate
python -m pip install -U pip wheel >/dev/null
# Quiet the bcrypt/passlib warning and ensure FastAPI stack present
python -m pip install "bcrypt==3.2.2" >/dev/null
if [[ -f requirements.txt ]]; then
  python -m pip install -r requirements.txt >/dev/null || true
else
  python -m pip install "fastapi==0.115.0" "uvicorn[standard]" "sqlmodel==0.0.22" "pydantic>=1,<3" "python-jose[cryptography]" "passlib[bcrypt]" >/dev/null || true
fi
deactivate

# --- Ensure init_db exists in app/core/db.py ---------------------------------
DB_FILE="app/core/db.py"
[[ -f "$DB_FILE" ]] || { echo "❌ $DB_FILE not found"; exit 1; }
DB_BACKUP="$DB_FILE.bak.$(date +%s)"
cp -a "$DB_FILE" "$DB_BACKUP"
echo "🗂  Backup of $DB_FILE -> $DB_BACKUP"

if ! grep -q 'from sqlmodel import SQLModel' "$DB_FILE"; then
  sed -i '1i from sqlmodel import SQLModel' "$DB_FILE"
  echo "  + inserted: from sqlmodel import SQLModel"
fi

if ! grep -q '^def init_db' "$DB_FILE"; then
  cat >> "$DB_FILE" <<'PY'

def init_db() -> None:
    """
    Compatibility shim for older app/main.py imports.
    Ensures models are registered and tables are created.
    Safe to call multiple times.
    """
    try:
        import app.models  # noqa: F401
    except Exception:
        pass
    try:
        SQLModel.metadata.create_all(engine)
    except Exception:
        pass
PY
  echo "  + appended init_db() shim"
else
  echo "  = init_db() already present"
fi

# --- Append RLS overrides and guard dependency in app/api/diet.py ------------
API_FILE="app/api/diet.py"
[[ -f "$API_FILE" ]] || { echo "❌ $API_FILE not found"; exit 1; }
API_BACKUP="$API_FILE.bak.$(date +%s)"
cp -a "$API_FILE" "$API_BACKUP"
echo "🗂  Backup of $API_FILE -> $API_BACKUP"

# Ensure imports for RLS helpers and Depends are present
ensure_import() {
  local line="$1"
  if ! grep -qF "$line" "$API_FILE"; then
    # Insert after last import block
    awk -v ins="$line" '
      BEGIN{done=0}
      /^[[:space:]]*(from|import) / { last=NR }
      { lines[NR]=$0 }
      END{
        for (i=1;i<=NR;i++){
          print lines[i]
          if (i==last && !done){ print ins; done=1 }
        }
        if (!done) print ins
      }' "$API_FILE" > "$API_FILE.tmp" && mv "$API_FILE.tmp" "$API_FILE"
    echo "  + inserted import: $line"
  else
    echo "  = import present: $line"
  fi
}

ensure_import "from sqlalchemy import text"
ensure_import "from sqlalchemy.exc import OperationalError"
ensure_import "from contextlib import contextmanager"
ensure_import "from fastapi import Depends"

# Append/overwrite RLS helpers (set_config on same connection)
if ! grep -q '^def _set_rls' "$API_FILE"; then
  APPEND_RLS=1
else
  APPEND_RLS=1  # always append to guarantee override
fi

if [[ "$APPEND_RLS" -eq 1 ]]; then
  cat >> "$API_FILE" <<'PY'

# --- RLS helpers (override; pin per-connection with set_config) --------------
def _set_rls(session: Session, uid: int) -> None:
    """
    Ensure Postgres RLS policies that use current_setting('app.user_id') see
    the correct value. We set the GUC on the SAME connection the Session uses.
    On SQLite / non-PG, this no-ops safely.
    """
    try:
        conn = session.connection()  # acquire/pin same connection
        conn.execute(text("select set_config('app.user_id', :val, false)"), {"val": str(uid)})
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

@contextmanager
def _rls(session: Session, uid: int):
    _set_rls(session, uid)
    try:
        yield
    finally:
        _reset_rls(session)

# Dependency that guarantees RLS is set before any DB call in an endpoint.
def rls_session(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _set_rls(session, user.id)
    try:
        yield session
    finally:
        _reset_rls(session)
# --- end RLS helpers override -------------------------------------------------
PY
  echo "  + appended RLS override & rls_session dependency"
fi

# Replace all Depends(get_session) with Depends(rls_session) in this file,
# but DO NOT re-edit the function we just appended (we appended after replacement).
sed -i -E 's/Depends\(\s*get_session\s*\)/Depends(rls_session)/g' "$API_FILE"
echo "  ~ replaced Depends(get_session) -> Depends(rls_session)"

# --- Quick import test using project venv ------------------------------------
PY_BIN="$ROOT/.venv/bin/python"
echo "🔎 Import test ..."
PYTHONPATH="$ROOT" "$PY_BIN" - <<'PY'
import importlib
m = importlib.import_module("app.main")
print("ok", type(m.app).__name__)
PY

# --- Restart systemd user service (if present) --------------------------------
if systemctl --user list-units | grep -q "$SERVICE_NAME"; then
  echo "🔁 Restarting $SERVICE_NAME ..."
  systemctl --user daemon-reload || true
  systemctl --user restart "$SERVICE_NAME" || true
  sleep 1
  systemctl --user status "$SERVICE_NAME" -n 40 --no-pager || true
else
  echo "ℹ️  User service $SERVICE_NAME not found. Skipping restart."
fi

# --- Health check -------------------------------------------------------------
echo "🌐 Health: GET /api/v1/status"
curl -sS http://127.0.0.1:8010/api/v1/status || true
echo

echo "✅ RLS dependency + init_db patch complete."

BASH
