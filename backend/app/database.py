from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

# FastAPI atiende las rutas síncronas en un threadpool de 40 hilos, y cada
# petición conserva su conexión desde la primera consulta (la de la sesión admin)
# hasta responder — también mientras espera el candado de equipos
# (concurrencia.py). Con el pool por defecto (5 + 10) una ráfaga de ~25 clientes
# lo agotaba: esperas de 30 s y 500 (QueuePool). 20 + 30 cubre los 40 hilos; en
# Postgres (max_connections 100 por defecto) sobra. SQLite en memoria usa otro
# tipo de pool que no acepta estos parámetros.
_pool = {} if settings.database_url.startswith("sqlite") else {"pool_size": 20, "max_overflow": 30}
engine = create_engine(settings.database_url, pool_pre_ping=True, **_pool)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
