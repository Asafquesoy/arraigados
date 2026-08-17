from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppSettings
from ..schemas import AppSettingsOut

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=AppSettingsOut)
def obtener_settings(db: Session = Depends(get_db)):
    """Público y sin autenticación: el formulario de registro lo consulta
    para decidir si muestra el campo de talla. Si por lo que sea la fila
    sembrada no existe todavía, responde con el valor por defecto en vez de
    fallar — nunca debe tumbar el formulario público."""
    row = db.get(AppSettings, 1)
    return AppSettingsOut(
        show_shirt_size=row.show_shirt_size if row else False,
        precio_mxn=row.precio_mxn if row else 350,
        pedir_comprobante=row.pedir_comprobante if row else True,
    )
