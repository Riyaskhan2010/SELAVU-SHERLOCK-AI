from pydantic_settings import BaseSettings
from typing import Optional, List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./costlens.db"

    # Legacy JWT (kept so existing tokens still work during migration)
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # Firebase Admin SDK
    # Set ONE of these:
    #   FIREBASE_SERVICE_ACCOUNT_PATH → path to downloaded service-account JSON file
    #   FIREBASE_SERVICE_ACCOUNT_JSON → the JSON content as a single-line string
    FIREBASE_SERVICE_ACCOUNT_PATH: Optional[str] = None
    FIREBASE_SERVICE_ACCOUNT_JSON: Optional[str] = None
    FIREBASE_PROJECT_ID: Optional[str] = None   # required if using ADC / env credentials

    # LLM
    LLM_PROVIDER: str = "groq"
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-3-haiku-20240307"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "groq/compound-mini"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # App
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
