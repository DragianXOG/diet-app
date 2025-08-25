# Diet App

Minimal FastAPI scaffold.

## Deploy (systemd user)
1) ./scripts/install.sh
2) ./scripts/status.sh
3) ./scripts/logs.sh

Local dev steps:
1) python3 -m venv .venv
2) source .venv/bin/activate
3) pip install -r requirements.txt
4) uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
