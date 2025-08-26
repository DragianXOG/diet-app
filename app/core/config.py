import os
from typing import List
from dotenv import load_dotenv

# Load .env at import time so gunicorn workers get env vars
load_dotenv()

class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Diet App")
    VERSION: str = os.getenv("APP_VERSION", "0.3.0")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # CORS
    _CORS: str = os.getenv("CORS_ORIGINS", "*")
    CORS_ORIGINS: List[str] = [o.strip() for o in _CORS.split(",") if o.strip()]

    # Auth
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")

settings = Settings()
