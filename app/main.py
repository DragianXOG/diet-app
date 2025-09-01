import time
from fastapi import FastAPI
from app.core.db import engine
from sqlmodel import SQLModel

# === Postgres helper (optional) ===
import os
DB_URL = os.getenv("DATABASE_URL")
_psyc = None
_conn = None

def _pg_conn():
    global _psyc, _conn
    if not DB_URL:
        return None
    if _psyc is None:
        import psycopg as _psyc  # lazy import
    if _conn is None or _conn.closed:
        _conn = _psyc.connect(DB_URL, autocommit=True)
    return _conn

def _pg_set_user(conn, user_id: int):
    if not conn: return
    with conn.cursor() as cur:
        cur.execute("SELECT set_config('app.user_id', %s::text, false)", (user_id,))

from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.logging import init_logging
from .core.db import init_db
from .api.routes import router as api_router
from .api.auth import router as auth_router
from .api.diet import router as diet_router

init_logging(settings.LOG_LEVEL)
ALLOW_ORIGINS = [
  "http://192.168.40.184:8080", "http://localhost:8080", "http://127.0.0.1:8080",
  "http://localhost:5173", "http://127.0.0.1:5173"
]

app = FastAPI(title=settings.APP_NAME, version=settings.VERSION)


# --- Unified DEV CORS (localhost + LAN) ---
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.40\.184)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --- /Unified DEV CORS ---
# CORS
allow_origins = ["*"] if settings.CORS_ORIGINS == ["*"] else settings.CORS_ORIGINS
@app.on_event("startup")
def _startup():
    init_db()

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
    <p class="muted">Tip: use <code>test@example.com</code> in <em>Authorize</em> to try protected endpoints.</p>
  </div>
</body>
</html>"""

# --- Browser root redirect to /app (keeps JSON for scripts/curl) ---
from fastapi import Request
from fastapi.responses import RedirectResponse

@app.middleware("http")
async def _root_html_redirect(request: Request, call_next):
    if request.url.path == "/" and "text/html" in request.headers.get("accept", "").lower():
        return RedirectResponse(url="/app", status_code=302)
    return await call_next(request)

# --- Simple interactive UI at /ui ---
from fastapi.responses import HTMLResponse

@app.get("/ui", response_class=HTMLResponse)
def ui_page():
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
    <p class="muted">Login with your account, then call protected endpoints.</p>

    <div class="grid">
      <div class="box">
        <h3>Login</h3>
        <label>Email</label>
        <input id="email" placeholder="test@example.com" value="test@example.com">
        <label>Password</label>
        <input id="password" type="password" placeholder="••••••••••">
        <div class="row">
          <button onclick="login()">Get Token</button>
          <button onclick="logout()">Logout</button>
        </div>
        <p class="muted" id="who"></p>
      </div>

      <div class="box">
        <h3>Auth: /api/v1/auth/me</h3>
        <div class="row">
          <button onclick="me()">Fetch Me</button>
        </div>
        <pre id="meOut"></pre>
      </div>

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

function token() { return localStorage.getItem('diet_token') || ''; }
function setToken(t) { localStorage.setItem('diet_token', t || ''); updateWho(); }
function hdrs(json=true){
  const h = new Headers();
  if (json) h.set('Content-Type','application/json');
  const t = token(); if (t) h.set('Authorization','Bearer '+t);
  return h;
}
function show(id, data){ $(id).textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2); }

async function login(){
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const body = new URLSearchParams();
  body.set('username', email);
  body.set('password', password);
  const res = await fetch(BASE + '/api/v1/auth/token', {
    method:'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const data = await res.json().catch(()=>({}));
  if (res.ok && data.access_token){ setToken(data.access_token); }
  else { alert('Login failed'); }
}
function logout(){ setToken(''); }

async function me(){
  const res = await fetch(BASE + '/api/v1/auth/me', { headers: hdrs() });
  show('#meOut', await res.json().catch(()=>res.status+' error'));
}
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
async function updateWho(){
  const t = token();
  if (!t){ $('#who').textContent = 'Not logged in'; return; }
  const res = await fetch(BASE + '/api/v1/auth/me', { headers: hdrs() });
  if (res.ok){
    const me = await res.json(); $('#who').textContent = 'Logged in as '+me.email+' (id '+me.id+')';
  } else { $('#who').textContent = 'Token invalid'; }
}
updateWho();
</script>
</body>
</html>"""

# --- Intake endpoints (file-backed + Postgres RLS) ---
from pathlib import Path as _Path
import json as _json, time as _time
from typing import Optional as _Optional
from pydantic import BaseModel as _BaseModel
from fastapi.responses import JSONResponse as _JSONResponse
from fastapi import Depends

# If your app provides get_current_user (JWT), use it; else allow None
try:
    get_current_user

except NameError:
    def get_current_user():
        return None

class IntakeIn(_BaseModel):
    name: _Optional[str] = None
    age: _Optional[int] = None
    sex: _Optional[str] = None
    height_in: _Optional[int] = None
    weight_lb: _Optional[int] = None
    diabetic: _Optional[bool] = None
    conditions: _Optional[str] = None
    meds: _Optional[str] = None
    goals: _Optional[str] = None
    zip: _Optional[str] = None
    gym: _Optional[str] = None
    email: _Optional[str] = None
    food_notes: _Optional[str] = None
    workout_notes: _Optional[str] = None

_DATA_DIR = _Path(__file__).resolve().parent.parent / "data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_INTAKE_PATH = _DATA_DIR / "intake.json"

@app.post("/api/v1/intake")
@app.post("/intake")

def _dev_uid_or_none():
    try:
        if _DEV_NO_AUTH:  # type: ignore[name-defined]
            return int(_dev_user()["id"])  # type: ignore[name-defined]
    except Exception:
        pass
    return None


def _normalize_intake(body: IntakeIn):  # type: ignore[name-defined]
    # Convert empty strings to None and drop unset fields
    raw = body.model_dump(exclude_unset=True)
    return {k: (v if v not in ("", None) else None) for k, v in raw.items()}

async def save_intake(body: IntakeIn, current_user: dict | None = None):
    try:
        # Prefer Postgres + RLS if configured; in dev/no-auth use a synthetic user id
        conn = _pg_conn()
        uid = None
        if conn is not None:
            if current_user and current_user.get('id'):
                uid = int(current_user['id'])
            else:
                uid = _dev_uid_or_none()

        if conn is not None and uid is not None:
            _pg_set_user(conn, uid)
            fields = _normalize_intake(body)
            fields['user_id'] = uid
            cols = ",".join(fields.keys())
            placeholders = ",".join(["%s"] * len(fields))
            values = list(fields.values())
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO life.intakes ({cols}) VALUES ({placeholders}) RETURNING id""",
                    values,
                )
                new_id = cur.fetchone()[0]
            return {"ok": True, "db": "postgres", "id": new_id}

        # Fallback to JSON file storage (works without auth/DB)
        items = []
        if _INTAKE_PATH.exists():
            try:
                items = _json.loads(_INTAKE_PATH.read_text() or "[]")
            except Exception:
                items = []
        entry = {
            "ts": int(_time.time()),
            "user_id": (current_user.get('id') if current_user else None),
            **_normalize_intake(body),
        }
        items.append(entry)
        _INTAKE_PATH.write_text(_json.dumps(items, indent=2))
        return {"ok": True, "path": str(_INTAKE_PATH), "saved": True, "received": entry}
    except Exception as e:
        return _JSONResponse({"ok": False, "error": str(e)}, status_code=500)
# --- end intake endpoints ---
# --- DEV CORS (lan + localhost) ---
from fastapi.middleware.cors import CORSMiddleware
try:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.40\.184)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
except Exception:
    pass
# --- /DEV CORS ---
@app.get("/api/v1/intake")
@app.get("/intake")
def get_intake(current_user: dict | None = Depends(get_current_user)):
    try:
        # Prefer Postgres + RLS if configured; in dev/no-auth use a synthetic user id
        conn = _pg_conn()
        if conn is not None:
            if current_user and current_user.get('id'):
                uid = int(current_user['id'])
            else:
                uid = _dev_uid_or_none()
        else:
            uid = None
        if conn is not None and uid is not None:
            _pg_set_user(conn, uid)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, user_id, name, age, sex, height_in, weight_lb, diabetic,
       conditions, meds, goals, zip, gym,
       food_notes, workout_notes,
       created_at
                    FROM life.intakes
                    WHERE user_id = %s
                    ORDER BY created_at DESC NULLS LAST
                    LIMIT 1
                    """,
                    (uid,),
                )
                row = cur.fetchone()
                if row:
                    cols = [d.name for d in cur.description]
                    return dict(zip(cols, row))
            return {}

        # Fallback to JSON file storage (works without auth/DB)
        if _INTAKE_PATH.exists():
            try:
                items = _json.loads(_INTAKE_PATH.read_text() or "[]")
            except Exception:
                items = []
            uid = current_user.get('id') if current_user else None
            if uid is not None:
                items = [it for it in items if it.get("user_id") == uid]
            if items:
                return items[-1]
        return {}
    except Exception as e:
        return _JSONResponse({"detail": str(e)}, status_code=500)

# --- DEV NO-AUTH SHIM (LAN-only) ---
import os as _os

_DEV_NO_AUTH = _os.getenv("DEV_NO_AUTH", "1") == "1"

def _dev_user():
    return {
        "id": int(_os.getenv("DEV_USER_ID", "37")),
        "email": _os.getenv("DEV_USER_EMAIL", "dev@example.com"),
        "token_version": 0,
    }

# Override get_current_user in dev mode
if _DEV_NO_AUTH:
    def get_current_user():
        return _dev_user()
# --- /DEV NO-AUTH SHIM ---

# --- DEV DEPENDENCY OVERRIDE (no-token) ---
try:
    # If routes already captured the original dependency, override it here.
    if _DEV_NO_AUTH:
        app.dependency_overrides[get_current_user] = lambda: _dev_user()
except Exception:
    # If either 'app' or 'get_current_user' isn't defined yet, ignore in dev
    pass
# --- /DEV DEPENDENCY OVERRIDE ---

# --- OPEN (NO-AUTH) INTAKE ENDPOINTS FOR DEV ---
# These call the same logic as the secured endpoints, but don't require auth.
# Safe because UFW already restricts inbound to 192.168.40.0/24.
@app.get("/api/v1/intake_open")
def get_intake_open():
    # Reuse the secured handler with no current_user
    return get_intake(current_user=None)  # type: ignore[name-defined]

@app.post("/api/v1/intake_open")
async def save_intake_open(body: IntakeIn):  # type: ignore[name-defined]
    # Reuse the secured handler with no current_user
    return await save_intake(body, current_user=None)  # type: ignore[name-defined]
# --- /OPEN (NO-AUTH) INTAKE ENDPOINTS FOR DEV ---


def _pg_reset_user(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT set_config('app.user_id', NULL, true)")
