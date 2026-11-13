"""Cierre automático del registro en línea.

El admin fija `app_settings.registro_cierre_en`; no hay cron: el cierre se aplica
de forma perezosa en la primera petición que lee la fila después de esa hora
(GET /api/settings, POST /api/registros y PATCH /api/admin/settings). Al
cumplirse se apaga `registro_abierto` y se borra la hora, para que si el admin
reabre a mano no se vuelva a cerrar solo con la hora vieja."""
from datetime import datetime, timezone

from .models import AppSettings
from .schemas import AppSettingsOut


def _utc(dt: datetime) -> datetime:
    """SQLite devuelve los datetimes sin zona; el backend siempre escribe UTC."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def aplicar_cierre_programado(row: AppSettings | None) -> bool:
    """Cierra el registro si ya llegó la hora programada. Devuelve True si
    cambió algo; quien llama hace el commit."""
    if row is None or row.registro_cierre_en is None:
        return False
    if _utc(row.registro_cierre_en) > datetime.now(timezone.utc):
        return False
    row.registro_abierto = False
    row.registro_cierre_en = None
    return True


def settings_out(row: AppSettings | None) -> AppSettingsOut:
    """Respuesta pública de settings; con valores por defecto si la fila no existe
    (nunca debe tumbar el formulario público)."""
    if row is None:
        return AppSettingsOut(
            show_shirt_size=False,
            precio_mxn=350,
            pedir_comprobante=True,
            registro_abierto=True,
            registro_cierre_en=None,
        )
    cierre = _utc(row.registro_cierre_en) if row.registro_cierre_en else None
    return AppSettingsOut(
        show_shirt_size=row.show_shirt_size,
        precio_mxn=row.precio_mxn,
        pedir_comprobante=row.pedir_comprobante,
        registro_abierto=row.registro_abierto,
        registro_cierre_en=cierre,
    )
