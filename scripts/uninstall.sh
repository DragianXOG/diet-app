#!/usr/bin/env bash
set -euo pipefail
UNIT="$HOME/.config/systemd/user/diet-app.service"
systemctl --user disable --now diet-app.service || true
systemctl --user daemon-reload || true
rm -f "$UNIT"
echo "Unit removed. (Repo files untouched.)"
