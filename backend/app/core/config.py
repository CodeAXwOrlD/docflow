from pydantic_settings import BaseSettings
from typing import Optional


import os

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://docflow:docflow_secret@localhost:5432/docflow_db"
    SYNC_DATABASE_URL: str = "postgresql://docflow:docflow_secret@localhost:5432/docflow_db"
    REDIS_URL: str = "redis://localhost:6379/0"
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: list[str] = [".pdf", ".txt", ".docx", ".doc", ".csv", ".xlsx", ".json", ".md"]
    SECRET_KEY: str = "docflow-super-secret-key-change-in-production"
    CORS_ORIGINS: str = "http://localhost:3000,https://docflow-sigma.vercel.app"
    ENVIRONMENT: str = "development"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
