#!/usr/bin/env bash
set -u -o pipefail

LOG="$HOME/diet-app/logs/restore-test.log"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/diet-app}"

# Parse connection parts from .env
URL="$(grep '^DATABASE_URL=' "$HOME/diet-app/.env" | cut -d= -f2-)"
PGUSER="$(printf '%s' "$URL" | sed -E 's#.*postgresql\+psycopg://([^:]+):.*#\1#')"
PGPASS="$(printf '%s' "$URL" | sed -E 's#.*postgresql\+psycopg://[^:]+:([^@]+)@.*#\1#')"
PGHOST="$(printf '%s' "$URL" | sed -E 's#.*@([^:/]+).*#\1#')"
PGPORT="$(printf '%s' "$URL" | sed -E 's#.*:([0-9]+)/.*#\1#')"
export PGUSER PGPASSWORD="$PGPASS" PGHOST PGPORT

ts(){ date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log(){ echo "$(ts) $*" | tee -a "$LOG" >&2; }

LATEST="$(ls -1t "$BACKUP_DIR"/dietapp_*.dump 2>/dev/null | head -n1 || true)"
if [[ -z "$LATEST" ]]; then
  log "ERROR no dumps found in $BACKUP_DIR"
  exit 2
fi

TMPDB="rt_$(date +%Y%m%d_%H%M%S)_$RANDOM"
log "START restore-test file=$(basename "$LATEST") tmpdb=$TMPDB"

# Create temp DB owned by app user
createdb "$TMPDB"
log "created DB $TMPDB"

# Restore dump (custom format)
if ! pg_restore -d "$TMPDB" -Fc --no-owner --no-acl "$LATEST"; then
  log "ERROR pg_restore failed"
  dropdb -f "$TMPDB" || true
  exit 3
fi
log "pg_restore completed"

# Helper: check table exists without failing the script
has_table() {
  local tbl="$1"
  psql -d "$TMPDB" -tA -c \
    "select 1 from information_schema.tables where table_schema='public' and table_name='${tbl}' limit 1;" \
    | grep -qx 1
}

need=(
  users
  ping
  meals
  meal_items
  grocery_items
  alembic_version
)

present=0
for t in "${need[@]}"; do
  if has_table "$t"; then
    log "check table:${t} OK"
    ((present++))
  else
    log "check table:${t} MISSING"
  fi
done

# Optional counts (don't affect result)
psql -d "$TMPDB" -tA -c "select count(*) from users;"   | sed 's/^/users: /'   >> "$LOG" 2>/dev/null || true
psql -d "$TMPDB" -tA -c "select count(*) from ping;"    | sed 's/^/ping: /'    >> "$LOG" 2>/dev/null || true

# Drop temp DB
dropdb -f "$TMPDB"
log "dropped DB $TMPDB"

if [[ "$present" -eq "${#need[@]}" ]]; then
  log "RESULT success ($present/${#need[@]})"
  exit 0
else
  log "RESULT failed ($present/${#need[@]})"
  exit 1
fi
