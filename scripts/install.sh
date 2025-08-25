#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/diet-app}"
UNIT_SRC="${APP_DIR}/deploy/systemd/diet-app.service"
UNIT_DEST="$HOME/.config/systemd/user/diet-app.service"

echo "[1/5] Ensure venv + deps…"
python3 -m venv "${APP_DIR}/.venv"
"${APP_DIR}/.venv/bin/python" -m pip install --upgrade pip
"${APP_DIR}/.venv/bin/pip" install -r "${APP_DIR}/requirements.txt"

echo "[2/5] Ensure .env exists…"
if [[ ! -f "${APP_DIR}/.env" ]]; then
  cat > "${APP_DIR}/.env" <<EOF
PORT=8010
EOF
  echo "  Wrote ${APP_DIR}/.env (edit as needed)"
fi

echo "[3/5] Install systemd user unit…"
mkdir -p "$HOME/.config/systemd/user"
install -m 0644 "${UNIT_SRC}" "${UNIT_DEST}"

echo "[4/5] Enable linger + reload/enable/start…"
loginctl enable-linger "$(whoami)" >/dev/null 2>&1 || true
systemctl --user daemon-reload
systemctl --user enable --now diet-app.service

echo "[5/5] Health check…"
sleep 1
curl -fsS "http://127.0.0.1:8010/health" || true
echo
echo "Done."
