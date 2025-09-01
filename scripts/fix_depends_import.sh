#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
FILE="app/api/diet.py"
BACKUP="${FILE}.bak.$(date +%s)"

[[ -f "$FILE" ]] || { echo "❌ $FILE not found (run from repo root)"; exit 1; }

cp -a "$FILE" "$BACKUP"
echo "🗂  Backup -> $BACKUP"

# 1) Remove any stray standalone "from fastapi import Depends" lines (the bad ones)
sed -i '/^[[:space:]]*from[[:space:]]\+fastapi[[:space:]]\+import[[:space:]]\+Depends[[:space:]]*$/d' "$FILE"

# 2) Ensure Depends is imported somewhere (either via combined fastapi import or add one at top)
if ! grep -qE 'from[[:space:]]+fastapi[[:space:]]+import[[:space:]].*Depends' "$FILE"; then
  echo "  + Depends not found in combined import; inserting a safe top-of-file import"
  awk '
    BEGIN { inserted=0 }
    NR==1 && $0 ~ /^#!/ { print; next }
    if (!inserted && $0 !~ /^from __future__ import/) {
      print "from fastapi import Depends"
      inserted=1
    }
    print
  ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
else
  echo "  = Depends already imported in a combined fastapi import"
fi

# 3) Import test using venv/system python
PY_BIN="$ROOT/.venv/bin/python"; [[ -x "$PY_BIN" ]] || PY_BIN="$(command -v python3)"
echo "🔎 Import test ..."
PYTHONPATH="$ROOT" "$PY_BIN" - <<'PY'
import importlib
m = importlib.import_module("app.main")
print("ok", type(m.app).__name__)
PY

echo "✅ Depends import repaired."
