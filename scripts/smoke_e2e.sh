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

echo "1) Signup..."
RESP=$(curl $CURLF -X POST "$BASE/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"user+$(date +%s)@example.com\",\"password\":\"ChangeMe123##\"}")
echo "   Response: $RESP"

if command -v python3 >/dev/null 2>&1; then
  TOK=$(printf '%s' "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)
else
  TOK=""
fi
[ -n "${TOK:-}" ] || TOK=$(printf '%s' "$RESP" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
[ -n "${TOK:-}" ] || { echo "❌ Could not extract token"; exit 1; }
echo "   ✅ Token (first 16): ${TOK:0:16}..."
AUTH=(-H "Authorization: Bearer $TOK")

echo "2) Rationalize intake..."
curl $CURLF -X POST "$BASE/intake/rationalize" "${AUTH[@]}" > /dev/null
echo "   ✅ Rationalized"

echo "3) Generate 7-day plan (persist, with recipes)..."
curl $CURLF -X POST "$BASE/plans/generate" "${AUTH[@]}" \
  -H 'Content-Type: application/json' \
  -d '{"days":7,"persist":true,"include_recipes":true,"confirm":true}' \
  | sed -n '1,8p'
echo; echo "   ✅ Plan generated"

echo "4) Sync groceries for current UTC week..."
START=$(date -u +%F); END=$(date -u -d "$START +6 days" +%F)
curl $CURLF -X POST "$BASE/groceries/sync_from_meals?start=$START&end=$END&persist=true" "${AUTH[@]}"
echo; echo "   ✅ Groceries synced"

echo "5) Price preview..."
curl $CURLF "$BASE/groceries/price_preview" "${AUTH[@]}" | sed -n '1,40p'
echo; echo "   ✅ Price preview OK"

echo "6) Assign & persist prices..."
curl $CURLF -X POST "$BASE/groceries/price_assign" "${AUTH[@]}"
echo; echo "   ✅ Prices assigned"

echo "7) Verify persisted fields..."
curl $CURLF "$BASE/groceries?only_open=true" "${AUTH[@]}" | sed -n '1,120p'
echo; echo "Smoke test: ✅ COMPLETE"
