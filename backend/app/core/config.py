import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://docflow:docflow_secret@localhost:5432/docflow_db"
    SYNC_DATABASE_URL: str = "postgresql://docflow:docflow_secret@localhost:5432/docflow_db"
    REDIS_URL: str = "redis://localhost:6379/0"
    UPLOAD_DIR: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
    )
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: List[str] = [
        ".pdf",
        ".txt",
        ".docx",
        ".doc",
        ".csv",
        ".xlsx",
        ".json",
        ".md",
    ]
    SECRET_KEY: str = "docflow-super-secret-key-change-in-production"
    ENCRYPTION_MASTER_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    STREAM_TOKEN_EXPIRE_SECONDS: int = 120
    AI_REQUEST_TIMEOUT_SECONDS: float = 45.0
    CORS_ORIGINS: str = "http://localhost:3000,https://docflow-sigma.vercel.app"
    ENVIRONMENT: str = "development"

    @property
    def cors_origins_list(self) -> List[str]:
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()
