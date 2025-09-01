import time
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse
from app.core.db import engine
from sqlmodel import SQLModel
import os

from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.logging import init_logging
from .core.db import init_db
from .api.routes import router as api_router
from .api.diet import router as diet_router
from .api.auth import router as auth_router

init_logging(settings.LOG_LEVEL)
ALLOW_ORIGINS = [
  "http://192.168.40.184:8080", "http://localhost:8080", "http://127.0.0.1:8080",
  "http://localhost:5173", "http://127.0.0.1:5173"
]

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    docs_url=("/docs" if settings.ENABLE_DOCS else None),
    redoc_url=None,
    openapi_url=("/openapi.json" if settings.ENABLE_DOCS else None),
)


# --- Unified DEV CORS (localhost + LAN) ---
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.40\.184)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=settings.SESSION_SECRET, max_age=settings.SESSION_MAX_AGE)
# --- /Unified DEV CORS ---
# CORS
allow_origins = ["*"] if settings.CORS_ORIGINS == ["*"] else settings.CORS_ORIGINS
from sqlalchemy import text as _sa_text, inspect as _sa_inspect


def _ensure_dev_user():
    try:
        # In dev/no-auth mode, ensure a synthetic user exists for FK/RLS
        if not os.getenv("DEV_NO_AUTH", "0") == "1":
            return
        uid = int(os.getenv("DEV_USER_ID", "37"))
        email = os.getenv("DEV_USER_EMAIL", "dev@example.com")
        with engine.begin() as conn:
            try:
                res = conn.execute(_sa_text("SELECT id FROM users WHERE id=:id").bindparams(id=uid))
                if res.first() is None:
                    conn.execute(
                        _sa_text(
                            """
                            INSERT INTO users (id, email, password_hash, token_version, created_at)
                            VALUES (:id, :email, :ph, 0, CURRENT_TIMESTAMP)
                            """
                        ).bindparams(id=uid, email=email, ph="dev")
                    )
            except Exception:
                # Table may not exist yet or other DB backends; ignore
                pass
    except Exception:
        pass

def _ensure_schema():
    """Ensure runtime schema tweaks without manual Alembic.
    - Add intakes.meals_per_day (INTEGER NULL) if missing.
    Safe on SQLite and Postgres.
    """
    try:
        insp = _sa_inspect(engine)
        cols = {c.get('name') for c in insp.get_columns('intakes')}
        with engine.begin() as conn:
            if 'meals_per_day' not in cols:
                try:
                    conn.execute(_sa_text('ALTER TABLE intakes ADD COLUMN meals_per_day INTEGER'))
                except Exception:
                    pass
            if 'workout_days_per_week' not in cols:
                try:
                    conn.execute(_sa_text('ALTER TABLE intakes ADD COLUMN workout_days_per_week INTEGER'))
                except Exception:
                    pass
            if 'workout_session_min' not in cols:
                try:
                    conn.execute(_sa_text('ALTER TABLE intakes ADD COLUMN workout_session_min INTEGER'))
                except Exception:
                    pass
            if 'workout_time' not in cols:
                try:
                    conn.execute(_sa_text('ALTER TABLE intakes ADD COLUMN workout_time VARCHAR(8)'))
                except Exception:
                    pass
    except Exception:
        # Inspector may fail on fresh DB; ignore
        pass

@app.on_event("startup")
def _startup():
    init_db()
    _ensure_dev_user()
    _ensure_schema()

@app.get("/")
def read_root():
    return {"ok": True, "app": settings.APP_NAME, "version": app.version}

@app.get("/health")
def health():
    return {"ok": True, "ts": int(time.time())}

# Routers
app.include_router(api_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1/auth")
app.include_router(diet_router, prefix="/api/v1")

# --- Minimal landing page (served by FastAPI) ---
from fastapi.responses import HTMLResponse

@app.get("/app", response_class=HTMLResponse)
def app_page():
    if not settings.ENABLE_DEV_PAGES:
        raise HTTPException(status_code=404)
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Diet App</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;margin:0;padding:2rem;background:#0b1020;color:#e6edf3}
  .card{max-width:720px;margin:0 auto;background:#111731;border:1px solid #1f2a44;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
  h1{margin:0 0 .25rem;font-size:1.6rem}
  .muted{color:#9fb0c3;margin:0 0 1rem}
  a.button{display:inline-block;margin-right:.5rem;margin-top:.5rem;padding:.6rem 1rem;border-radius:10px;border:1px solid #2a3a5c;text-decoration:none;color:#e6edf3}
  a.button:hover{background:#0f1a33}
  code{background:#0f1a33;border:1px solid #223457;border-radius:8px;padding:.2rem .4rem}
</style>
</head>
<body>
  <div class="card">
    <h1>Diet App</h1>
    <p class="muted">Local API is running on this host.</p>
    <p>
      <a class="button" href="/docs">Open API Docs</a>
      <a class="button" href="/health">Health</a>
      <a class="button" href="/api/v1/status">Status JSON</a>
    </p>
    <p class="muted">Tip: use the links above to explore the API.</p>
  </div>
</body>
</html>"""

# --- Redirect any HTML requests to the UI front page ---
@app.middleware("http")
async def _redirect_html_to_ui(request: Request, call_next):
    try:
        accept = request.headers.get("accept", "").lower()
        path = request.url.path
        if "text/html" in accept and not path.startswith("/api"):
            # Build UI base target
            ui_base = settings.UI_BASE
            if not ui_base:
                scheme = request.url.scheme or "http"
                host = request.url.hostname or "localhost"
                port = settings.UI_PORT
                ui_base = f"{scheme}://{host}:{port}"
            return RedirectResponse(url=ui_base, status_code=302)
    except Exception:
        pass
    return await call_next(request)

# --- Simple interactive UI at /ui ---
from fastapi.responses import HTMLResponse

@app.get("/ui", response_class=HTMLResponse)
def ui_page():
    if not settings.ENABLE_DEV_PAGES:
        raise HTTPException(status_code=404)
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Diet App UI</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;margin:0;padding:2rem;background:#0b1020;color:#e6edf3}
  .card{max-width:860px;margin:0 auto;background:#111731;border:1px solid #1f2a44;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
  h1{margin:0 0 .5rem;font-size:1.6rem}
  .muted{color:#9fb0c3;margin:0 0 1rem}
  input,button{padding:.6rem .8rem;border-radius:10px;border:1px solid #2a3a5c;background:#0f1a33;color:#e6edf3}
  input{width:100%;max-width:280px;margin-right:.5rem}
  button{cursor:pointer}
  .row{display:flex;gap:.5rem;flex-wrap:wrap;margin:.5rem 0}
  pre{background:#0f1a33;border:1px solid #223457;border-radius:8px;padding:.75rem;overflow:auto}
  .grid{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:1rem}
  .box{border:1px solid #223457;border-radius:12px;padding:12px;background:#0f1428}
  label{display:block;font-size:.9rem;margin:.25rem 0 .25rem .1rem;color:#9fb0c3}
</style>
</head>
<body>
  <div class="card">
    <h1>Diet App — Minimal UI</h1>
    <p class="muted">LAN-only demo UI. No login required.</p>

    <div class="grid">
      

      <div class="box">
        <h3>Create Meal</h3>
        <label>Meal name</label>
        <input id="mealName" value="turkey sandwich">
        <div class="row">
          <button onclick="createMeal()">POST /meals</button>
          <button onclick="listMeals()">GET /meals</button>
        </div>
        <pre id="mealOut"></pre>
      </div>

      <div class="box">
        <h3>Groceries</h3>
        <label>Item name</label>
        <input id="gName" value="eggs">
        <label>Qty</label>
        <input id="gQty" value="12">
        <label>Unit</label>
        <input id="gUnit" value="ct">
        <div class="row">
          <button onclick="addGrocery()">POST /groceries</button>
          <button onclick="listGroceries()">GET /groceries</button>
        </div>
        <pre id="groOut"></pre>
      </div>
    </div>

    <p class="muted">Docs: <a class="button" href="/docs">/docs</a> • Health: <a class="button" href="/health">/health</a></p>
  </div>

<script>
const $ = sel => document.querySelector(sel);
const BASE = '';
function hdrs(json=true){
  const h = new Headers();
  if (json) h.set('Content-Type','application/json');
  return h;
}
function show(id, data){ $(id).textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2); }

async function createMeal(){
  const payload = { name: $('#mealName').value, items: [{name:'turkey',calories:180},{name:'bread',calories:140}] };
  const res = await fetch(BASE + '/api/v1/meals', { method:'POST', headers: hdrs(), body: JSON.stringify(payload) });
  show('#mealOut', await res.json().catch(()=>res.status+' error'));
}
async function listMeals(){
  const res = await fetch(BASE + '/api/v1/meals', { headers: hdrs() });
  show('#mealOut', await res.json().catch(()=>res.status+' error'));
}
async function addGrocery(){
  const payload = { name: $('#gName').value, quantity: Number($('#gQty').value), unit: $('#gUnit').value };
  const res = await fetch(BASE + '/api/v1/groceries', { method:'POST', headers: hdrs(), body: JSON.stringify(payload) });
  show('#groOut', await res.json().catch(()=>res.status+' error'));
}
async function listGroceries(){
  const res = await fetch(BASE + '/api/v1/groceries?only_open=false', { headers: hdrs() });
  show('#groOut', await res.json().catch(()=>res.status+' error'));
}
// no user auth in demo UI
</script>
</body>
</html>"""

# Removed legacy intake endpoints; use app/api/diet.py for intake, meals, etc.
