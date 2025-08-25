#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/5] Fetching from origin…"
git fetch --all -p
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
echo "  local:  $LOCAL"
echo "  remote: $REMOTE"

if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "[2/5] Pulling fast-forward…"
  git pull --ff-only
else
  echo "  Already up to date."
fi

echo "[3/5] Syncing Python deps…"
./.venv/bin/pip install -r requirements.txt

echo "[4/5] Restarting systemd user service…"
systemctl --user restart diet-app.service
sleep 1

echo "[5/5] Health check via Nginx:"
curl -fsS http://127.0.0.1/health || true
echo
