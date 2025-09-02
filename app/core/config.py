import os
from typing import List
from dotenv import load_dotenv

# Load .env at import time so gunicorn workers get env vars
load_dotenv()

class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Diet App")
    VERSION: str = os.getenv("APP_VERSION", "0.4.0")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # CORS
    _CORS: str = os.getenv("CORS_ORIGINS", "*")
    CORS_ORIGINS: List[str] = [o.strip() for o in _CORS.split(",") if o.strip()]

    # Session
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "dev-session-secret-change-me")
    SESSION_MAX_AGE: int = int(os.getenv("SESSION_MAX_AGE", "3600"))

    # UI/Docs exposure (default: off in LAN)
    ENABLE_DOCS: bool = os.getenv("ENABLE_DOCS", "0") == "1"
    ENABLE_DEV_PAGES: bool = os.getenv("ENABLE_DEV_PAGES", "0") == "1"

    # Frontend redirect target
    UI_BASE: str | None = os.getenv("UI_BASE") or None
    UI_PORT: int = int(os.getenv("UI_PORT", "8080"))

    # LLM toggle (OpenAI) — enabled by default; falls back safely if no API key
    LLM_ENABLED: bool = os.getenv("LLM_ENABLED", "1") == "1"
    LLM_PROVIDER: str | None = os.getenv("LLM_PROVIDER") or "openai"
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY") or None

settings = Settings()
