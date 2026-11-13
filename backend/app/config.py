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

    # Respaldo para la laptop sin internet (ver respaldo.py). IMPORTAR reemplaza
    # todos los registros, así que solo se enciende en la laptop del campamento
    # (PERMITIR_IMPORTAR_RESPALDO=true en backend/.env); en producción queda apagado.
    permitir_importar_respaldo: bool = False
    respaldos_dir: str = "./data/respaldos"

    # Lectura automática de comprobantes (conciliacion). Gemini es el lector
    # principal (plan gratis de Google AI Studio); sin key o sin cuota cae a
    # Tesseract local. Ambos son opcionales: sin ninguno, el encargado captura a mano.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"  # gemini-2.5-flash-lite ya no está disponible (404)
    tesseract_cmd: str = ""


settings = Settings()
