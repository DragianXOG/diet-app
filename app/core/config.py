import os
from typing import List

class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Diet App")
    VERSION: str = os.getenv("APP_VERSION", "0.2.0")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    # Comma-separated list or "*" for any
    CORS_ORIGINS: List[str] = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]

settings = Settings()
