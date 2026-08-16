from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://arraigados:arraigados@db:5432/arraigados"
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12

    admin_username: str = "admin"
    admin_password: str = "change-me"

    public_origin: str = "http://localhost:5173"

    tickets_dir: str = "/data/tickets"
    max_upload_mb: int = 8

    camp_name: str = "Arraigados"


settings = Settings()
