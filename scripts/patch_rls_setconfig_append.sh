#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
FILE="app/api/diet.py"
BACKUP="${FILE}.bak.$(date +%s)"
SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"

[[ -f "$FILE" ]] || { echo "❌ $FILE not found. Run from your repo root."; exit 1; }

cp -a "$FILE" "$BACKUP"
echo "🗂  Backup -> $BACKUP"

# Ensure needed imports exist (idempotent)
ensure_import() {
  local line="$1"
  if ! grep -qF "$line" "$FILE"; then
    # Insert after other imports if possible, else prepend
    if grep -n '^from ' "$FILE" | head -n1 >/dev/null; then
      # Insert after the last import line block
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
        }' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
    else
      printf "%s\n%s\n" "$line" "$(cat "$FILE")" > "$FILE"
    fi
    echo "  + inserted import: $line"
  else
    echo "  = import present: $line"
  fi
}

ensure_import "from sqlalchemy import text"
ensure_import "from sqlalchemy.exc import OperationalError"
ensure_import "from contextlib import contextmanager"

# Append override block (rebinds names at module level)
cat >> "$FILE" <<'PY'

# --- RLS helpers (override to pin per-connection with set_config) -------------
def _set_rls(session: Session, uid: int) -> None:
    """
    Ensure Postgres RLS policies that use current_setting('app.user_id') see
    the correct value. We pin the GUC on the SAME connection the Session will
    use by touching session.connection(). On SQLite, this no-ops.
    """
    try:
        conn = session.connection()  # acquire/pin the connection
        conn.execute(text("select set_config('app.user_id', :val, false)"), {"val": str(uid)})
    except OperationalError:
        # SQLite / non-PG -> ignore
        pass
    except Exception:
        # Never crash requests over RLS helpers
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
# --- end RLS helpers override -------------------------------------------------
PY

# Import test
PY_BIN="$ROOT/.venv/bin/python"
if [[ ! -x "$PY_BIN" ]]; then PY_BIN="$(command -v python3)"; fi
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
  systemctl --user status "$SERVICE_NAME" -n 30 --no-pager || true
else
  echo "ℹ️  User service $SERVICE_NAME not found. Skipping restart."
fi

echo "🌐 Health: "
curl -sS http://127.0.0.1:8010/api/v1/status || true; echo
echo "✅ RLS override appended."
