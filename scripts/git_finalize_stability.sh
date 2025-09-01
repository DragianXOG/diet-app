#!/usr/bin/env bash
set -euo pipefail
branch="feature/meal-plan-generate-tab"

# Ensure we’re on the feature branch
current="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
if [[ "$current" != "$branch" ]]; then
  git checkout -B "$branch"
fi

# Add the touched files/scripts
git add \
  app/api/diet.py \
  app/core/db.py \
  scripts/*.sh

git status --short

# Commit
git commit -m "stabilize: RLS (set_config), time-aware meals, raw-SQL groceries w/ audit columns, SQLModel exec fixes; price preview/assign with file fallback"

echo "✓ Committed on $branch"

# Optional: push if remote exists
if git remote -v | grep -q origin; then
  git push -u origin "$branch"
else
  echo "ℹ️ No remote 'origin' configured. Add one and push:"
  echo "   git remote add origin <YOUR_GITHUB_URL>"
  echo "   git push -u origin $branch"
fi
