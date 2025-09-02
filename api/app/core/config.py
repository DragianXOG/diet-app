from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Life – Health API"
    HOST: str = "0.0.0.0"
    PORT: int = 8010

    # Allow your dev frontend
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
        "http://192.168.40.184:8080",
    ]

    # DB connection
    DATABASE_URL: str = "postgresql+psycopg://life_app:lifeapp_local@127.0.0.1:5432/dietapp"

    # Auth removed in LAN-only mode

settings = Settings()
