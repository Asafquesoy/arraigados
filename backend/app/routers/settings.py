from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppSettings
from ..registro_cierre import aplicar_cierre_programado, settings_out
from ..schemas import AppSettingsOut

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=AppSettingsOut)
def obtener_settings(db: Session = Depends(get_db)):
    """Público y sin autenticación: el formulario de registro lo consulta
    para decidir si muestra el campo de talla. Si por lo que sea la fila
    sembrada no existe todavía, responde con el valor por defecto en vez de
    fallar — nunca debe tumbar el formulario público. Aquí también se aplica el
    cierre programado del registro si ya llegó su hora."""
    row = db.get(AppSettings, 1)
    if aplicar_cierre_programado(row):
        db.commit()
    return settings_out(row)
