#!/usr/bin/env bash
set -Eeuo pipefail

# Dev launcher: FastAPI (uvicorn) + Vite

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Load environment variables from .env if present
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Prefer local venv if available
if [[ -d .venv ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

PYTHON_BIN="${PYTHON:-python3}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8010}"
UI_PORT="${UI_PORT:-8080}"

# Require Postgres DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[dev] ERROR: DATABASE_URL is not set. Create .env with a Postgres URL."
  exit 1
fi
if ! printf "%s" "$DATABASE_URL" | grep -qiE '^postgres'; then
  echo "[dev] ERROR: This environment is Postgres-only. DATABASE_URL must be a Postgres URL."
  exit 1
fi

echo "[dev] Using python: $($PYTHON_BIN -V 2>/dev/null || echo "$PYTHON_BIN")"

# Start backend (uvicorn) in background
echo "[dev] Starting API on ${HOST}:${PORT} (reload) …"
"$PYTHON_BIN" -m uvicorn app.main:app --host "$HOST" --port "$PORT" --reload &
API_PID=$!

wait_for_api() {
  local tries=${1:-60}
  local paths=("/health" "/api/v1/health" "/" "/docs")
  echo -n "[dev] Waiting for API to be ready"
  for i in $(seq 1 "$tries"); do
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo
      echo "[dev] API process exited early. Check your Python env and dependencies (pip install -r requirements.txt)."
      return 1
    fi
    if command -v curl >/dev/null 2>&1; then
      for p in "${paths[@]}"; do
        code=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}:${PORT}${p}" || true)
        if [[ "$code" == "200" || "$code" == "302" ]]; then
          echo " — ready ($p $code)"
          return 0
        fi
      done
    else
      # Fallback: try TCP connect using bash and /dev/tcp
      (echo > /dev/tcp/"$HOST"/"$PORT") >/dev/null 2>&1 && { echo " — ready (tcp)"; return 0; }
    fi
    echo -n "."
    sleep 0.5
  done
  echo
  echo "[dev] API did not become ready on http://${HOST}:${PORT}. Is the virtualenv active and requirements installed?"
  echo "       Try: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  return 1
}

wait_for_api || { echo "[dev] Aborting dev startup."; exit 1; }

cleanup() {
  echo
  echo "[dev] Shutting down (API pid=$API_PID) …"
  kill "$API_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ensure_ui_deps() {
  local lock_hash_file="ui/.pkglock.sha1"
  local cur_hash=""
  if command -v sha1sum >/dev/null 2>&1; then
    cur_hash="$(sha1sum ui/package-lock.json 2>/dev/null | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    cur_hash="$(shasum ui/package-lock.json 2>/dev/null | awk '{print $1}')"
  fi
  local prev_hash=""
  [[ -f "$lock_hash_file" ]] && prev_hash="$(cat "$lock_hash_file" 2>/dev/null || true)"

  if [[ ! -d ui/node_modules || -z "$cur_hash" || "$cur_hash" != "$prev_hash" ]]; then
    echo "[dev] Installing UI dependencies (npm ci)…"
    (cd ui && npm ci || npm install)
    [[ -n "$cur_hash" ]] && echo "$cur_hash" > "$lock_hash_file" || true
  fi
}

ensure_ui_deps

echo "[dev] Starting Vite dev server on :${UI_PORT} …"
cd ui

# Allow passing VITE_API_BASE to Vite (optional)
if [[ -n "${VITE_API_BASE:-}" ]]; then
  export VITE_API_BASE
  echo "[dev] VITE_API_BASE=${VITE_API_BASE}"
fi

# If UI_PORT differs from the package.json default, run vite directly to set port
if [[ "${UI_PORT}" != "8080" ]]; then
  VITE_API_BASE="${VITE_API_BASE:-}" npx vite --host 0.0.0.0 --port "${UI_PORT}"
else
  VITE_API_BASE="${VITE_API_BASE:-}" npm run dev
fi
