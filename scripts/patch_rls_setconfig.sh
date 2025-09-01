#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
FILE="app/api/diet.py"
BACKUP="${FILE}.bak.$(date +%s)"
SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"

[[ -f "$FILE" ]] || { echo "❌ $FILE not found. Run from your repo root."; exit 1; }

cp -a "$FILE" "$BACKUP"
echo "🗂  Backup -> $BACKUP"

# Find block markers
START_LINE="$(grep -n '^# --- SQLite-safe RLS wrappers' "$FILE" | head -n1 | cut -d: -f1 || true)"
END_LINE="$(grep -n '^# --- Helpers for pricing' "$FILE" | head -n1 | cut -d: -f1 || true)"

if [[ -z "$START_LINE" || -z "$END_LINE" ]]; then
  echo "❌ Could not find wrapper markers in $FILE"
  echo "   Looked for:"
  echo "     # --- SQLite-safe RLS wrappers"
  echo "     # --- Helpers for pricing"
  exit 1
fi

TMPBLOCK="$(mktemp)"
cat > "$TMPBLOCK" <<'PY'
# --- SQLite-safe RLS wrappers -------------------------------------------------
def _set_rls(session: Session, uid: int) -> None:
    """
    Set a per-connection session GUC so Postgres RLS policies that read
    current_setting('app.user_id') see the correct value. On SQLite, this
    silently no-ops.
    """
    try:
        # Persist on the connection (session-level), survives statement boundaries
        session.exec(text("select set_config('app.user_id', :val, false)"), {"val": str(uid)})
    except OperationalError:
        # SQLite / non-PG -> ignore
        pass
    except Exception:
        # Never crash requests over RLS helpers
        pass

def _reset_rls(session: Session) -> None:
    try:
        session.exec(text("reset app.user_id"))
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
# --- Helpers for pricing ------------------------------------------------------
PY

# Rebuild file with new block
{
  head -n $((START_LINE-1)) "$FILE"
  cat "$TMPBLOCK"
  tail -n +$END_LINE "$FILE"
} > "${FILE}.new"

mv "${FILE}.new" "$FILE"
rm -f "$TMPBLOCK"

echo "🔎 Import test (venv if present) ..."
PY_BIN="$ROOT/.venv/bin/python"
if [[ ! -x "$PY_BIN" ]]; then PY_BIN="$(command -v python3)"; fi
PYTHONPATH="$ROOT" "$PY_BIN" - <<'PY'
import importlib
m = importlib.import_module("app.main")
print("ok", type(m.app).__name__)
PY

echo "🔁 Restart service (if present) ..."
if systemctl --user list-units | grep -q "$SERVICE_NAME"; then
  systemctl --user daemon-reload || true
  systemctl --user restart "$SERVICE_NAME" || true
  sleep 1
  systemctl --user status "$SERVICE_NAME" -n 30 --no-pager || true
else
  echo "  (No $SERVICE_NAME found; skipping restart)"
fi

echo "🌐 Health:"
curl -sS http://127.0.0.1:8010/api/v1/status || true; echo
echo "✅ RLS set_config patch complete."
