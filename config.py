from pydantic import SecretStr


class Settings:
    AUTH_SECRET_KEY: SecretStr = SecretStr("change-me-in-production")
    RATE_LIMIT_PER_MINUTE: int = 60


settings = Settings()
