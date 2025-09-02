# Diet App v0.4.0

Postgres-only, dev launcher, ingredient-aware and calorie-targeted diet planning, PhD Coach prompts, and UX tweaks.

## Highlights
- LLM planning (enabled by default):
  - Diet: respects avoid-ingredient preferences and targets daily calories based on Mifflin–St Jeor + activity and goal rate.
  - Workouts: S3N framing (specificity, progressive overload, fatigue management) with strict JSON shape.
  - Automatic fallback to deterministic planners if no key.
- Ingredient preferences multi-select on About You / Intake.
- Calories per meal shown; daily totals align with target.
- Groceries sync is idempotent and clears open items by default.
- Dev launcher to start API + UI with health wait (`./scripts/dev.sh`).

## Setup
- Requirements: Python 3.12, Node 20, npm 10+.
- Postgres only. Example URL: `postgresql+psycopg://user:pass@127.0.0.1:5432/dietdb`.
- Copy `.env.example` to `.env`; set `DATABASE_URL` and `OPENAI_API_KEY`.
- Start: `./scripts/dev.sh`

## New Scripts
- `scripts/setup_postgres.sh`: Create role/db, write `.env`.
- `scripts/reset_db.py`: Drop & recreate app tables.

## API
- `/api/v1/status` now includes `llm_enabled` and `llm_key_present`.

## Notes
- This app is for wellness planning; not medical advice.
