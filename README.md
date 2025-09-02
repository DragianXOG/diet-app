# Diet App

Postgres‑backed FastAPI + React app for planning nutrition and workouts. Now includes LLM‑assisted “PhD Coach v3.27” planning with ingredient preferences and calorie‑aware diet generation.

## Features
- Postgres only: reliable SQLModel + Alembic setup.
- Dev launcher: `./scripts/dev.sh` starts API (Uvicorn) + UI (Vite), waits for health, and installs UI deps.
- LLM planning (enabled by default):
  - Diet: respects avoid‑ingredient preferences; targets daily calories based on Mifflin–St Jeor + activity and goal rate.
  - Workouts: S3N framing (specificity, progressive overload, fatigue management); strict JSON.
  - Falls back to deterministic planners if no key.
- About You / Intake: collects goals, stats, workout prefs, and ingredient “avoid” list.
- Groceries: idempotent sync from meal plan; quantities don’t inflate on rebuild.

## Quick Start (Local Dev)
1) python3 -m venv .venv
2) source .venv/bin/activate
3) pip install -r requirements.txt
4) cp .env.example .env and set a Postgres `DATABASE_URL`
5) Optional: create DB/user quickly
   - sudo ./scripts/setup_postgres.sh -u dxdb -d dietdb -p 'your-password'
6) ./scripts/dev.sh  # starts API at 127.0.0.1:8010 and UI at 127.0.0.1:8080

UI
- Login/Register, then land on “About You”.
- Set stats, goals (e.g., “lose 15 lb in 8 weeks”), workout days/week, and uncheck ingredients to avoid.
- Meal Plan → Generate 7‑Day Plan (shows kcal per meal; daily total meets target).
- Workout Plan → Generate 7‑Day Workouts.

LLM
- Enabled by default. Add your key to `.env`:
  - `OPENAI_API_KEY=sk-...`
- Header shows “LLM Active” when enabled and key present.

## Database & Scripts
- Postgres required. Example: `postgresql+psycopg://user:pass@127.0.0.1:5432/dietdb`
- `scripts/setup_postgres.sh`: create role/db, write `.env` with psycopg v3 URL.
- `scripts/reset_db.py --yes`: drop & recreate app tables (Postgres).
- `scripts/flush_users.py`: truncate core app tables.

## Manual API run
- export DATABASE_URL='postgresql+psycopg://user:pass@127.0.0.1:5432/dietapp'
- uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload

## Deploy (systemd user)
1) ./scripts/install.sh
2) ./scripts/status.sh
3) ./scripts/logs.sh

## Status / Health
- API status: `GET /api/v1/status` → includes `llm_enabled` and `llm_key_present`.
- Health: `GET /health`

## Notes
- This app is for wellness planning; not medical advice. Always consult a professional for medical decisions.
