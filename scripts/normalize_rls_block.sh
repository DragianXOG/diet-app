#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
FILE="app/api/diet.py"
BACKUP="${FILE}.bak.$(date +%s)"

[[ -f "$FILE" ]] || { echo "❌ $FILE not found. Run from your repo root."; exit 1; }

cp -a "$FILE" "$BACKUP"
echo "🗂  Backup -> $BACKUP"

# 1) Remove any previously appended RLS override block to avoid duplicates.
#    Looks for the markers we used earlier.
awk '
BEGIN{skip=0}
$0 ~ /^# --- RLS helpers \(override/ {skip=1; next}
skip && $0 ~ /^# --- end RLS helpers override/ {skip=0; next}
!skip {print}
' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"

# 2) Find the first route decorator to insert BEFORE it.
first_route=$(grep -n '^@router\.' "$FILE" | head -n1 | cut -d: -f1)
if [ -z "$first_route" ]; then
  # fallback to end-of-file if no route found (unlikely)
  first_route=$(wc -l < "$FILE")
  first_route=$((first_route+1))
fi

# 3) Build the RLS block (set_config pinned to the same connection).
cat > /tmp/rls_block.py <<'PY'
# --- RLS helpers (override; pin per-connection with set_config) --------------
def _set_rls(session: Session, uid: int) -> None:
    """
    Ensure Postgres RLS policies that use current_setting('app.user_id') see
    the correct value. We set the GUC on the SAME connection the Session uses.
    On SQLite / non-PG, this no-ops safely.
    """
    try:
        conn = session.connection()  # acquire/pin the same connection
        conn.execute(text("select set_config('app.user_id', :val, false)"), {"val": str(uid)})
    except OperationalError:
        pass
    except Exception:
        pass

def _reset_rls(session: Session) -> None:
    try:
        conn = session.connection()
        conn.execute(text("reset app.user_id"))
    except OperationalError:
        pass
    except Exception:
        pass

@contextmanager
def _rls(session: Session, uid: int):
    _set_rls(session, uid)
    try:
        yield
    finally:
        _reset_rls(session)

def rls_session(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _set_rls(session, user.id)
    try:
        yield session
    finally:
        _reset_rls(session)
# --- end RLS helpers override -------------------------------------------------
PY

# 4) Insert the block just BEFORE the first route decorator.
awk -v insert_line="$first_route" '
NR==FNR {block = block $0 ORS; next}
NR==insert_line {print block}
{print}
' /tmp/rls_block.py "$FILE" > "$FILE.new" && mv "$FILE.new" "$FILE"
rm -f /tmp/rls_block.py

# 5) Ensure required imports exist, without breaking try/except blocks.
ensure_import_top() {
  local pattern="$1"
  local line="$2"
  if ! grep -qF "$pattern" "$FILE"; then
    # Insert after shebang and any from __future__ import, at a safe top-of-file spot.
    awk -v ins="$line" '
      BEGIN{inserted=0}
      NR==1 && $0 ~ /^#!/ { print; next; }
      if (!inserted) {
        print
        if ($0 !~ /^from __future__ import/ && $0 !~ /^#!/) {
          print ins
          inserted=1
        }
        next
      }
      print
    ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
    echo "  + inserted import: $line"
  fi
}

ensure_import_top "from sqlalchemy import text" "from sqlalchemy import text"
ensure_import_top "from sqlalchemy.exc import OperationalError" "from sqlalchemy.exc import OperationalError"
ensure_import_top "from contextlib import contextmanager" "from contextlib import contextmanager"
# FastAPI Depends likely already in a combined import; ensure if not:
if ! grep -qE 'from[[:space:]]+fastapi[[:space:]]+import[[:space:]].*Depends' "$FILE"; then
  ensure_import_top "from fastapi import Depends" "from fastapi import Depends"
fi

# 6) Import test
PY_BIN="$ROOT/.venv/bin/python"; [ -x "$PY_BIN" ] || PY_BIN="$(command -v python3)"
echo "🔎 Import test ..."
PYTHONPATH="$ROOT" "$PY_BIN" - <<'PY'
import importlib
m = importlib.import_module("app.main")
print("ok", type(m.app).__name__)
PY

echo "✅ RLS block normalized and import ok."
