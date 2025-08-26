#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/diet-app}"
cd "$REPO_DIR"

echo "[deploy] user=$(whoami) host=$(hostname -f)"
echo "[deploy] repo=$(basename "$REPO_DIR") branch=$(git rev-parse --abbrev-ref HEAD) rev=$(git rev-parse --short HEAD)"

echo "[deploy] fetching origin/main…"
git fetch origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main || echo "")"
if [[ -n "$REMOTE" && "$LOCAL" != "$REMOTE" ]]; then
  echo "[deploy] updating to origin/main"
  git reset --hard origin/main
else
  echo "[deploy] already up to date with origin/main"
fi

echo "[deploy] ensuring venv + deps…"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

echo "[deploy] running migrations…"
./.venv/bin/alembic -c alembic.ini upgrade head

echo "[deploy] restarting service…"
systemctl --user reload diet-app.service || systemctl --user restart diet-app.service
sleep 2
systemctl --user is-active --quiet diet-app.service && echo "[deploy] service is active"

echo "[deploy] health checks…"
HTTP="$(curl -sS http://127.0.0.1/health || true)"
HTTPS="$(curl -sk https://dxs.local/health || true)"
echo "[health http]  $HTTP"
echo "[health https] $HTTPS"

echo "[deploy] done."
