import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError, ProgrammingError

from .config import settings
from .database import SessionLocal
from .models import AdminRole, AdminUser, AppSettings
from .routers import admin, auth, equipos, public, settings as settings_router
from .security import hash_password

logger = logging.getLogger("arraigados")


def seed_admin() -> None:
    """Crea el usuario admin inicial. Se omite en silencio si las tablas
    aún no existen (p. ej. antes de correr `alembic upgrade head` la primera
    vez) — el backend puede iniciar igual y el seed se reintenta en el
    siguiente arranque/reinicio del contenedor."""
    db = SessionLocal()
    try:
        if not db.query(AdminUser).filter(AdminUser.username == settings.admin_username).first():
            db.add(
                AdminUser(
                    username=settings.admin_username,
                    password_hash=hash_password(settings.admin_password),
                    role=AdminRole.ADMIN,
                )
            )
            db.commit()
    except (ProgrammingError, OperationalError):
        db.rollback()
        logger.warning("No se pudo sembrar el admin: las migraciones aún no se han aplicado.")
    finally:
        db.close()


def seed_settings() -> None:
    """Crea la fila única (id=1) de interruptores editables desde el panel
    admin si todavía no existe. Igual patrón que seed_admin(): se omite en
    silencio si las tablas aún no existen."""
    db = SessionLocal()
    try:
        if not db.get(AppSettings, 1):
            db.add(
                AppSettings(
                    id=1,
                    show_shirt_size=False,
                    precio_mxn=350,
                    pedir_comprobante=True,
                    registro_abierto=True,
                    equipos_auto=True,
                    eq_balance_edad=True,
                    eq_balance_bautismo=True,
                    eq_balance_procedencia=True,
                    eq_balance_sexo=True,
                    eq_balance_tamano=True,
                )
            )
            db.commit()
    except (ProgrammingError, OperationalError):
        db.rollback()
        logger.warning("No se pudo sembrar app_settings: las migraciones aún no se han aplicado.")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_admin()
    seed_settings()
    yield


app = FastAPI(title=f"{settings.camp_name} — API de registro", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.public_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(public.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin.usuarios_router)
app.include_router(equipos.router)
app.include_router(settings_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "camp": settings.camp_name}
