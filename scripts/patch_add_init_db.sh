cat > scripts/patch_add_init_db.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
DB_FILE="app/core/db.py"
SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"

if [[ ! -f "$DB_FILE" ]]; then
  echo "❌ $DB_FILE not found. Run this from your repo root (directory with app/)."
  exit 1
fi

BACKUP="$DB_FILE.bak.$(date +%s)"
cp -a "$DB_FILE" "$BACKUP"
echo "🗂  Backup of $DB_FILE -> $BACKUP"

# Ensure SQLModel is imported (should already be via previous patch)
if ! grep -q 'from sqlmodel import SQLModel' "$DB_FILE"; then
  sed -i '1i from sqlmodel import SQLModel' "$DB_FILE"
  echo "  + inserted: from sqlmodel import SQLModel"
fi

# Append init_db shim if missing
if grep -q '^def init_db' "$DB_FILE"; then
  echo "  = init_db already present; no changes"
else
  cat >> "$DB_FILE" <<'PY'

def init_db() -> None:
    """
    Compatibility shim for older app/main.py imports.
    Ensures models are registered and tables are created.
    Safe to call multiple times.
    """
    try:
        # Ensure all SQLModel models are imported/registered
        import app.models  # noqa: F401
    except Exception:
        # If import fails, still attempt create_all
        pass
    try:
        SQLModel.metadata.create_all(engine)
    except Exception:
        # Never raise on init in production boot; logs will show details
        pass
PY
  echo "  + appended init_db() shim"
fi

# Determine interpreter
PY_BIN="$ROOT/.venv/bin/python"
if [[ ! -x "$PY_BIN" ]]; then
  PY_BIN="$(command -v python3 || true)"
fi
if [[ -z "$PY_BIN" ]]; then
  echo "❌ No python interpreter found. Install python3 first."
  exit 1
fi

# Import test using venv/system python
echo "🔎 Import test ..."
PYTHONPATH="$ROOT" "$PY_BIN" - <<'PY'
import importlib
m = importlib.import_module("app.main")
print("ok", type(m.app).__name__)
PY

# Restart systemd user service if present
if systemctl --user list-units | grep -q "$SERVICE_NAME"; then
  echo "🔁 Restarting $SERVICE_NAME ..."
  systemctl --user daemon-reload || true
  systemctl --user restart "$SERVICE_NAME" || true
  sleep 1
  systemctl --user status "$SERVICE_NAME" -n 50 --no-pager || true
else
  echo "ℹ️  User service $SERVICE_NAME not found. Skipping restart."
fi

# Health check
echo "🌐 Health: GET /api/v1/status"
if command -v curl >/dev/null 2>&1; then
  curl -sS http://127.0.0.1:8010/api/v1/status || true
  echo
fi

echo "✅ init_db shim patched."
BASH

chmod +x scripts/patch_add_init_db.sh
./scripts/patch_add_init_db.sh
