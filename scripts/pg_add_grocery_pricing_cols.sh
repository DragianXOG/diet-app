#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-diet-app.service}"

# 1) Resolve DATABASE_URL: prefer env; else read from systemd unit
DBURL="${DATABASE_URL:-}"
if [[ -z "${DBURL}" ]]; then
  # Pull Environment= lines, split on spaces, pick DATABASE_URL=...
  DBURL="$(systemctl --user cat "${SERVICE_NAME}" 2>/dev/null \
    | sed -n 's/^[[:space:]]*Environment=//p' \
    | tr ' ' '\n' \
    | sed -n 's/^DATABASE_URL=//p' \
    | tail -n 1)"
  # Strip surrounding quotes if present
  DBURL="${DBURL%\"}"; DBURL="${DBURL#\"}"
fi

if [[ -z "${DBURL}" ]]; then
  echo "❌ DATABASE_URL not found. Export it and re-run, e.g.:"
  echo "   export DATABASE_URL='postgresql+psycopg2://user:pass@host/dbname'"
  exit 1
fi

echo "🔗 Using DATABASE_URL (driver): ${DBURL%%:*}"

# 2) Run DDL via project venv Python + SQLAlchemy
PY_BIN="./.venv/bin/python"
[[ -x "$PY_BIN" ]] || PY_BIN="$(command -v python3)"

DATABASE_URL="$DBURL" "$PY_BIN" - <<'PY'
import os, sys
from sqlalchemy import create_engine, text

url = os.environ["DATABASE_URL"]
if not (url.startswith("postgres") or url.startswith("postgresql")):
    print(f"Refusing to alter non-Postgres URL: {url}", file=sys.stderr); sys.exit(2)

engine = create_engine(url)
with engine.begin() as conn:
    # Add columns if they don't exist
    conn.execute(text("ALTER TABLE IF EXISTS grocery_items ADD COLUMN IF NOT EXISTS store TEXT"))
    conn.execute(text("ALTER TABLE IF EXISTS grocery_items ADD COLUMN IF NOT EXISTS unit_price DOUBLE PRECISION"))
    conn.execute(text("ALTER TABLE IF EXISTS grocery_items ADD COLUMN IF NOT EXISTS total_price DOUBLE PRECISION"))

    # Show resulting columns for verification
    rows = conn.execute(text("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'grocery_items'
        ORDER BY ordinal_position
    """)).fetchall()

print("📋 grocery_items columns:")
for name, dtype in rows:
    print(f" - {name}: {dtype}")
PY

# 3) Restart the service
echo "🔁 Restarting ${SERVICE_NAME} ..."
systemctl --user daemon-reload || true
systemctl --user restart "${SERVICE_NAME}" || true
sleep 1
systemctl --user status "${SERVICE_NAME}" -n 30 --no-pager || true

echo "✅ Pricing columns ensured."
