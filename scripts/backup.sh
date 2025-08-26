#!/usr/bin/env bash
set -euo pipefail

# Read DATABASE_URL from .env
REPO_DIR="${REPO_DIR:-$HOME/diet-app}"
ENV_FILE="$REPO_DIR/.env"
if ! grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  echo "[backup] ERROR: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi
URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
# Convert SQLAlchemy-style URL -> libpq for pg_dump
LIBPQ_URL="${URL/postgresql+psycopg:/postgresql:}"

# Where to store backups
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/diet-app}"
mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/dietapp_${TS}.dump"

echo "[backup] starting dump to $OUT"
pg_dump "$LIBPQ_URL" -Fc -f "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo "[backup] created $OUT ($SIZE)"

# Simple retention: keep last N dumps (default 30)
RETENTION_COUNT="${RETENTION_COUNT:-30}"
mapfile -t FILES < <(ls -1t "$BACKUP_DIR"/dietapp_*.dump 2>/dev/null || true)
if (( ${#FILES[@]} > RETENTION_COUNT )); then
  for f in "${FILES[@]:RETENTION_COUNT}"; do
    rm -f "$f" "$f.sha256"
    echo "[backup] pruned $f"
  done
fi
echo "[backup] done."
