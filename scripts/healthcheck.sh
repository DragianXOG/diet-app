#!/usr/bin/env bash
set -u -o pipefail

LOG_DIR="$HOME/diet-app/logs"
STATE_DIR="$HOME/.local/state/diet-app"
mkdir -p "$LOG_DIR" "$STATE_DIR"
LOG_FILE="$LOG_DIR/health.log"
COUNT_FILE="$STATE_DIR/healthfail.count"

HEALTH_URL="${HEALTH_URL:-https://dxs.local/health}"
TIMEOUT="${TIMEOUT:-4}"
RETRIES="${RETRIES:-1}"
WEBHOOK_URL="${WEBHOOK_URL:-}"
AUTO_RESTART="${AUTO_RESTART:-no}"
RESTART_AFTER_FAILS="${RESTART_AFTER_FAILS:-3}"

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }

curl_try() {
  curl -sSkm "$TIMEOUT" -w '%{http_code}' -o /tmp/health.json "$HEALTH_URL" || echo "000"
}

ok=false
code=""
for i in $(seq 1 "$RETRIES"); do
  code="$(curl_try)"
  if [[ "$code" == "200" ]]; then
    python3 - <<'PY' >/dev/null 2>&1
import json,sys
try:
  d=json.load(open("/tmp/health.json"))
  assert d.get("ok") is True
except Exception:
  sys.exit(1)
PY
    if [[ $? -eq 0 ]]; then ok=true; break; fi
  fi
  sleep 1
done

fail_count="$(cat "$COUNT_FILE" 2>/dev/null || echo 0)"

if [[ "$ok" == true ]]; then
  echo "$(ts) OK code=$code" >> "$LOG_FILE"
  echo 0 > "$COUNT_FILE"
else
  ((fail_count++))
  echo "$fail_count" > "$COUNT_FILE"
  body="$(cat /tmp/health.json 2>/dev/null || echo "(no body)")"
  msg="$(ts) FAIL code=${code} fails=${fail_count} url=${HEALTH_URL} body=${body}"
  echo "$msg" >> "$LOG_FILE"
  if [[ -n "$WEBHOOK_URL" ]]; then
    curl -sS -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"diet-app healthcheck: ${msg//\"/\\\"}\"}" "$WEBHOOK_URL" >/dev/null || true
  fi
  if [[ "$AUTO_RESTART" == "yes" && "$fail_count" -ge "$RESTART_AFTER_FAILS" ]]; then
    echo "$(ts) ACTION restarting service after $fail_count consecutive failures" >> "$LOG_FILE"
    systemctl --user restart diet-app.service || true
    echo 0 > "$COUNT_FILE"
  fi
fi

# Always succeed so the timer stays green
exit 0
