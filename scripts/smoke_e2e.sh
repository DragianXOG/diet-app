#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"
BASE="${BASE:-http://127.0.0.1:8010/api/v1}"

if curl --help all 2>/dev/null | grep -q -- '--fail-with-body'; then
  CURLF='--fail-with-body -sS'
else
  CURLF='-fsS'
fi

show_trace() {
  echo
  echo "🔎 Last traceback from systemd logs:"
  journalctl --user -u "$SERVICE_NAME" -n 200 --no-pager -o cat | sed -n '/Traceback/,$p' || true
}
trap 'echo "❌ Smoke test failed."; show_trace' ERR

echo "1) LAN mode — no auth; proceeding without token"
AUTH=()

echo "2) Rationalize intake..."
curl $CURLF -X POST "$BASE/intake/rationalize" > /dev/null
echo "   ✅ Rationalized"

echo "3) Generate 7-day plan (persist, with recipes)..."
curl $CURLF -X POST "$BASE/plans/generate" \
  -H 'Content-Type: application/json' \
  -d '{"days":7,"persist":true,"include_recipes":true,"confirm":true}' \
  | sed -n '1,8p'
echo; echo "   ✅ Plan generated"

echo "4) Sync groceries for current UTC week..."
START=$(date -u +%F); END=$(date -u -d "$START +6 days" +%F)
curl $CURLF -X POST "$BASE/groceries/sync_from_meals?start=$START&end=$END&persist=true"
echo; echo "   ✅ Groceries synced"

echo "5) Price preview..."
curl $CURLF "$BASE/groceries/price_preview" | sed -n '1,40p'
echo; echo "   ✅ Price preview OK"

echo "6) Assign & persist prices..."
curl $CURLF -X POST "$BASE/groceries/price_assign"
echo; echo "   ✅ Prices assigned"

echo "7) Verify persisted fields..."
curl $CURLF "$BASE/groceries?only_open=true" | sed -n '1,120p'
echo; echo "Smoke test: ✅ COMPLETE"
