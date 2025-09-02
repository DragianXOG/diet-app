# Diet App

Minimal FastAPI scaffold.

## Deploy (systemd user)
1) ./scripts/install.sh
2) ./scripts/status.sh
3) ./scripts/logs.sh

Local dev (Postgres only):
1) python3 -m venv .venv
2) source .venv/bin/activate
3) pip install -r requirements.txt
4) cp .env.example .env and set a Postgres `DATABASE_URL`
5) ./scripts/dev.sh  # launches API (Uvicorn) and UI (Vite)

Manual API only:
- export DATABASE_URL='postgresql+psycopg://user:pass@127.0.0.1:5432/dietapp'
- uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload

## Configuration
Copy `.env.example` to `.env` and edit values. The app currently uses `PORT` only.
