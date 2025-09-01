#!/usr/bin/env bash
set -euo pipefail

# -----------------------------
# Config (override if you like)
# -----------------------------
SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"   # systemd --user service name
PY_MIN_PKGS=("fastapi==0.115.0" "uvicorn[standard]" "sqlmodel==0.0.22" "pydantic>=1,<3" "python-jose[cryptography]" "passlib[bcrypt]")

# -------------------------------------------
# 0) Find repo root that contains app/main.py
# -------------------------------------------
find_repo_root() {
  if [[ -f "app/main.py" ]]; then
    echo "$(pwd)"
    return
  fi
  if [[ -d "diet-app" && -f "diet-app/app/main.py" ]]; then
    echo "$(pwd)/diet-app"
    return
  fi
  # Search up to 3 levels under current directory
  local hit
  hit=$(find . -maxdepth 3 -type f -path "*/app/main.py" | head -n1 || true)
  if [[ -n "${hit}" ]]; then
    echo "$(cd "$(dirname "${hit}")/.." && pwd)"
    return
  fi
  echo ""
}

ROOT="$(find_repo_root)"
if [[ -z "${ROOT}" ]]; then
  echo "❌ Could not find repo root (directory containing app/main.py)."
  echo "   Run this script from your project root or within a parent directory."
  exit 1
fi
echo "📁 Repo root: ${ROOT}"
cd "${ROOT}"

# -----------------------------------
# 1) Ensure Python & create .venv
# -----------------------------------
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

echo "⬆️  Upgrading pip & wheel ..."
. .venv/bin/activate
python -m pip install -U pip wheel >/dev/null

if [[ -f "requirements.txt" ]]; then
  echo "📦 Installing requirements.txt ..."
  python -m pip install -r requirements.txt
else
  echo "📦 requirements.txt not found; installing minimal deps ..."
  python -m pip install "${PY_MIN_PKGS[@]}"
fi
deactivate

PY_BIN="${ROOT}/.venv/bin/python"

# -----------------------------------------------------
# 2) Patch app/main.py to add startup create_all hook
# -----------------------------------------------------
MAIN_FILE="app/main.py"
if [[ ! -f "${MAIN_FILE}" ]]; then
  echo "❌ ${MAIN_FILE} not found (unexpected)."
  exit 1
fi

BACKUP="${MAIN_FILE}.bak.$(date +%s)"
cp -a "${MAIN_FILE}" "${BACKUP}"
echo "🗂  Backup of app/main.py -> ${BACKUP}"

# Ensure imports exist (idempotent)
ensure_import() {
  local import_line="$1"
  if ! grep -qF "${import_line}" "${MAIN_FILE}"; then
    # Prefer inserting after 'from fastapi import FastAPI' if present, otherwise at top
    if grep -q '^from fastapi import FastAPI' "${MAIN_FILE}"; then
      sed -i "/^from fastapi import FastAPI/a ${import_line}" "${MAIN_FILE}"
      echo "  + inserted import: ${import_line}"
    else
      # Insert near top (after shebang or future import if present)
      awk -v ins="${import_line}" '
        NR==1 && $0 ~ /^#!/ { print; next_insert=1; next; }
        next_insert==1 && $0 ~ /^from __future__ import/ { print; next; }
        next_insert==1 { print; print ins; next_insert=0; next }
        { print }
      ' "${MAIN_FILE}" > "${MAIN_FILE}.tmp" && mv "${MAIN_FILE}.tmp" "${MAIN_FILE}"
      echo "  + prepended import: ${import_line}"
    fi
  else
    echo "  = import already present: ${import_line}"
  fi
}

echo "🔧 Ensuring imports in app/main.py ..."
ensure_import "from pathlib import Path"
ensure_import "from sqlmodel import SQLModel"
ensure_import "from app.core.db import engine"

# Insert startup hook if missing (idempotent)
if grep -q '@app.on_event("startup")' "${MAIN_FILE}"; then
  echo "  = startup hook already present"
else
  echo "🧩 Inserting startup hook ..."
  STARTUP_BLOCK=$'# --- Auto-create tables & ensure data dirs on startup ---\n@app.on_event("startup")\ndef _startup_bootstrap():\n    Path("data").mkdir(parents=True, exist_ok=True)\n    Path("data/plans").mkdir(parents=True, exist_ok=True)\n    try:\n        SQLModel.metadata.create_all(engine)\n        print("[startup] SQLModel.create_all done")\n    except Exception as e:\n        print(f"[startup] create_all skipped/failed: {e}")\n'
  if grep -q '@app.get("/api/v1/status")' "${MAIN_FILE}"; then
    # Insert just above status route
    sed -i "/@app.get(\"\/api\/v1\/status\")/i ${STARTUP_BLOCK}" "${MAIN_FILE}"
  else
    # Append at end
    printf "\n%s\n" "${STARTUP_BLOCK}" >> "${MAIN_FILE}"
  fi
fi

# -------------------------------------------------
# 3) Import test using venv python (FastAPI needed)
# -------------------------------------------------
echo "🔎 Import test (venv) ..."
PYTHONPATH="${ROOT}" "${PY_BIN}" - <<'PY'
import importlib
m = importlib.import_module("app.main")
print("ok", type(m.app).__name__)
PY

# -------------------------------------------------
# 4) Restart systemd user service (if present)
# -------------------------------------------------
if systemctl --user list-units | grep -q "${SERVICE_NAME}"; then
  echo "🔁 Restarting ${SERVICE_NAME} ..."
  systemctl --user daemon-reload || true
  systemctl --user restart "${SERVICE_NAME}" || true
  sleep 1
  systemctl --user status "${SERVICE_NAME}" -n 50 --no-pager || true
else
  echo "ℹ️  User service ${SERVICE_NAME} not found. Skipping restart."
  echo "    If your service has a different name, re-run with:"
  echo "      SERVICE_NAME=your.service ./patch_step_b.sh"
fi

# --------------------------------------------
# 5) Health check (best-effort, does not fail)
# --------------------------------------------
echo "🌐 Health check: GET /api/v1/status"
if command -v curl >/dev/null 2>&1; then
  curl -sS http://127.0.0.1:8010/api/v1/status || true
  echo
else
  echo "curl not installed; skipping."
fi

echo "✅ Step B patch complete."
