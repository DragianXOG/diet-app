import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.logging import init_logging
from .core.db import init_db
from .api.routes import router as api_router
from .api.auth import router as auth_router

init_logging(settings.LOG_LEVEL)
app = FastAPI(title=settings.APP_NAME, version=settings.VERSION)

# CORS
allow_origins = ["*"] if settings.CORS_ORIGINS == ["*"] else settings.CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

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
