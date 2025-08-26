import os
from typing import List

class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Diet App")
    VERSION: str = os.getenv("APP_VERSION", "0.3.0")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # CORS
    CORS_ORIGINS: List[str] = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]

    # Auth
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")

settings = Settings()
