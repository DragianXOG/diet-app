#!/usr/bin/env bash
set -Eeuo pipefail

# Setup Postgres role and database for Diet App, and write .env
# Usage:
#   sudo ./scripts/setup_postgres.sh -u dxdb -d dietdb -p 'your-password'
# Or run as your user and it will use sudo for psql.

USER_IN=""
DB_IN=""
PASS_IN=""
HOST_IN="127.0.0.1"
PORT_IN="5432"

while getopts ":u:d:p:h:P:" opt; do
  case $opt in
    u) USER_IN="$OPTARG" ;;
    d) DB_IN="$OPTARG" ;;
    p) PASS_IN="$OPTARG" ;;
    h) HOST_IN="$OPTARG" ;;
    P) PORT_IN="$OPTARG" ;;
    *) echo "Usage: $0 -u <user> -d <db> -p <password> [-h host] [-P port]" >&2; exit 2 ;;
  esac
done

if [[ -z "$USER_IN" ]]; then
  read -rp "Enter Postgres username to create/use [dxdb]: " USER_IN || true
  USER_IN=${USER_IN:-dxdb}
fi
if [[ -z "$DB_IN" ]]; then
  read -rp "Enter database name to create/use [dietdb]: " DB_IN || true
  DB_IN=${DB_IN:-dietdb}
fi
if [[ -z "$PASS_IN" ]]; then
  read -rsp "Enter password for role '$USER_IN': " PASS_IN || true
  echo
fi

echo "[setup] Creating role '$USER_IN' and database '$DB_IN' on $HOST_IN:$PORT_IN"

PSQL="psql"
if ! command -v psql >/dev/null 2>&1; then
  echo "[setup] ERROR: psql not found. Install PostgreSQL client tools." >&2
  exit 1
fi

# Run psql as the postgres OS user if possible
run_psql() {
  local sql="$1"
  if id -u postgres >/dev/null 2>&1; then
    # Prefer local UNIX socket with peer auth as OS user 'postgres' (no password required)
    sudo -u postgres "$PSQL" -v ON_ERROR_STOP=1 -d postgres -tAc "$sql"
  else
    # Fallback: TCP to localhost as postgres role (may prompt for password)
    "$PSQL" -v ON_ERROR_STOP=1 -h "$HOST_IN" -p "$PORT_IN" -U postgres -d postgres -tAc "$sql"
  fi
}

# Create role if missing (with SCRAM password)
SQL_CREATE_ROLE=$(cat <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = '{USER}'
  ) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '{USER}', '{PASS}');
  ELSE
    EXECUTE format('ALTER ROLE %I LOGIN PASSWORD %L', '{USER}', '{PASS}');
  END IF;
END$$;
SQL
)
# Substitute safely
SQL_CREATE_ROLE=${SQL_CREATE_ROLE//\{USER\}/${USER_IN}}
SQL_CREATE_ROLE=${SQL_CREATE_ROLE//\{PASS\}/${PASS_IN}}
run_psql "$SQL_CREATE_ROLE" >/dev/null
echo "[setup] Role ensured: $USER_IN"

# Create database if missing and set owner
EXISTS_DB=$(run_psql "SELECT 1 FROM pg_database WHERE datname = '${DB_IN}'") || true
if [[ -z "${EXISTS_DB// }" ]]; then
  # CREATE DATABASE must run outside transaction/function
  if id -u postgres >/dev/null 2>&1; then
    sudo -u postgres "$PSQL" -v ON_ERROR_STOP=1 -d postgres -tAc "CREATE DATABASE \"${DB_IN}\" OWNER \"${USER_IN}\";"
  else
    "$PSQL" -v ON_ERROR_STOP=1 -h "$HOST_IN" -p "$PORT_IN" -U postgres -d postgres -tAc "CREATE DATABASE \"${DB_IN}\" OWNER \"${USER_IN}\";"
  fi
  echo "[setup] Database created: $DB_IN (owner: $USER_IN)"
else
  # Ensure owner
  run_psql "ALTER DATABASE \"${DB_IN}\" OWNER TO \"${USER_IN}\";" >/dev/null || true
  echo "[setup] Database exists: $DB_IN (owner ensured: $USER_IN)"
fi

# Grant privileges (idempotent)
run_psql "GRANT ALL PRIVILEGES ON DATABASE \"${DB_IN}\" TO \"${USER_IN}\";" >/dev/null || true

# Write .env with psycopg v3 URL
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
URL="postgresql+psycopg://${USER_IN}:$(printf '%s' "$PASS_IN" | sed 's/@/%40/g')@${HOST_IN}:${PORT_IN}/${DB_IN}"

if [[ -f "$ENV_FILE" ]]; then
  # Update or append DATABASE_URL
  if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
    sed -i "s#^DATABASE_URL=.*#DATABASE_URL=${URL//#/\\#}#" "$ENV_FILE"
  else
    printf '\nDATABASE_URL=%s\n' "$URL" >> "$ENV_FILE"
  fi
else
  cat > "$ENV_FILE" <<EOF
PORT=8010
APP_NAME="Diet App"
APP_VERSION=0.2.0
LOG_LEVEL=INFO
CORS_ORIGINS=*

DATABASE_URL=${URL}

# Sessions (set a strong secret)
SECRET_KEY=$(openssl rand -base64 32 2>/dev/null | tr '+/' '-_' || echo change-me)
ACCESS_TOKEN_EXPIRE_MINUTES=3600
JWT_ALGORITHM=HS256

# LLM (enabled by default). Set your key to activate external plans.
LLM_ENABLED=1
OPENAI_API_KEY=
EOF
fi

echo "[setup] Wrote DATABASE_URL to $ENV_FILE"
echo "[setup] Done. Start dev with: ./scripts/dev.sh"

# Quick connectivity check as the app role
if command -v psql >/dev/null 2>&1; then
  if PGPASSWORD="$PASS_IN" psql -h "$HOST_IN" -p "$PORT_IN" -U "$USER_IN" -d "$DB_IN" -tAc 'select 1' >/dev/null 2>&1; then
    echo "[setup] Verified login as ${USER_IN} to ${DB_IN}."
  else
    echo "[setup] WARNING: Could not verify login as ${USER_IN} to ${DB_IN}. Check pg_hba.conf and password."
  fi
fi
