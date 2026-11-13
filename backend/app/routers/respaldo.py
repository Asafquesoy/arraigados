"""Respaldo completo para la laptop sin internet (ver `app/respaldo.py`).

Todo es solo Admin. IMPORTAR además exige `PERMITIR_IMPORTAR_RESPALDO=true` en el
`.env` de esa máquina: en producción queda apagado para que nadie pueda reemplazar
los registros con un archivo viejo."""

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import respaldo
from ..config import settings
from ..database import get_db
from ..models import AdminRole
from ..security import get_current_admin, require_role

router = APIRouter(
    prefix="/api/admin/respaldo",
    tags=["admin-respaldo"],
    dependencies=[Depends(get_current_admin), Depends(require_role(AdminRole.ADMIN))],
)

# Los 3 CSV de ~200 registros pesan unos KB; 25 MB deja mucho margen y corta archivos absurdos.
MAX_SUBIDA_BYTES = 25 * 1024 * 1024


class RespaldoInfo(BaseModel):
    importar_permitido: bool
    version: str | None


class ConteosOut(BaseModel):
    equipos: int
    registros: int
    calificaciones: int
    puntos_extra: int


class ResumenOut(BaseModel):
    creado_en: str | None
    version: str | None
    archivo: ConteosOut
    actual: ConteosOut
    importado: bool


@router.get("/info", response_model=RespaldoInfo)
def info(db: Session = Depends(get_db)):
    return RespaldoInfo(importar_permitido=settings.permitir_importar_respaldo, version=respaldo.version_local(db))


@router.get("/descargar")
def descargar(db: Session = Depends(get_db)):
    contenido = respaldo.exportar_zip(db)
    nombre = f"respaldo_arraigados_{datetime.now().strftime('%Y%m%d_%H%M')}.zip"
    return Response(
        content=contenido,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


def _procesar(db: Session, datos: bytes, confirmar: bool) -> dict:
    try:
        rb = respaldo.leer_zip(datos)
        respaldo.revisar_version(db, rb)
    except respaldo.RespaldoVersionError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from None
    except respaldo.RespaldoError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from None

    resultado = respaldo.resumen(db, rb)
    if not confirmar:
        return {**resultado, "importado": False}

    respaldo.guardar_copia_previa(db)
    respaldo.importar(db, rb)
    return {**resultado, "actual": respaldo.contar(db), "importado": True}


@router.post("/importar", response_model=ResumenOut)
async def importar(
    archivo: UploadFile = File(...),
    confirmar: bool = Form(default=False),
    db: Session = Depends(get_db),
):
    """Sin `confirmar` solo revisa el archivo y devuelve qué reemplazaría; con
    `confirmar` guarda primero una copia de lo actual y luego reemplaza."""
    if not settings.permitir_importar_respaldo:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Importar un respaldo está apagado en este servidor."
        )
    datos = await archivo.read(MAX_SUBIDA_BYTES + 1)
    if len(datos) > MAX_SUBIDA_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "El archivo es demasiado grande.")
    # La importación es de varios segundos y síncrona: fuera del bucle de eventos
    # para no congelar al resto de peticiones.
    return await run_in_threadpool(_procesar, db, datos, confirmar)
