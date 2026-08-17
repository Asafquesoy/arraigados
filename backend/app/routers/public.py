from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppSettings, Camper, Sexo, TallaCamisa, Zona
from ..ratelimit import rate_limit
from ..schemas import CamperCreateResponse
from ..storage import save_ticket

router = APIRouter(prefix="/api/registros", tags=["registro"])


@router.post(
    "",
    response_model=CamperCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("registro", max_hits=10, window_seconds=600))],
)
async def crear_registro(
    nombre: str = Form(..., min_length=2, max_length=150),
    iglesia: str = Form(..., min_length=2, max_length=150),
    edad: int = Form(..., ge=5, le=99),
    sexo: Sexo = Form(...),
    zona: Zona = Form(...),
    bautizado: bool = Form(...),
    fecha_bautismo: str | None = Form(default=None, max_length=100),
    fecha_pago: date = Form(...),
    tiene_promocion: bool = Form(...),
    promocion_detalle: str | None = Form(default=None, max_length=200),
    talla_camisa: TallaCamisa | None = Form(default=None),
    talla_otra: str | None = Form(default=None, max_length=50),
    ticket: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    if bautizado and not (fecha_bautismo or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Indica la fecha de tu bautismo.")
    if tiene_promocion and not (promocion_detalle or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Menciona qué promoción obtuviste.")
    if talla_camisa == TallaCamisa.OTRA and not (talla_otra or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Menciona qué talla necesitas.")

    # No confiar en el cliente para decidir si el comprobante es obligatorio —
    # se vuelve a consultar app_settings aquí (el toggle admin puede haber
    # cambiado entre que el navegador cargó el formulario y este POST).
    settings_row = db.get(AppSettings, 1)
    pedir_comprobante = settings_row.pedir_comprobante if settings_row else True
    if pedir_comprobante and ticket is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sube tu comprobante de pago.")

    filename, mime = await save_ticket(ticket) if ticket is not None else (None, None)

    camper = Camper(
        nombre=nombre.strip(),
        iglesia=iglesia.strip(),
        edad=edad,
        sexo=sexo,
        zona=zona,
        bautizado=bautizado,
        fecha_bautismo=fecha_bautismo.strip() if bautizado and fecha_bautismo else None,
        fecha_pago=fecha_pago,
        tiene_promocion=tiene_promocion,
        promocion_detalle=promocion_detalle.strip() if tiene_promocion and promocion_detalle else None,
        talla_camisa=talla_camisa,
        talla_otra=talla_otra.strip() if talla_camisa == TallaCamisa.OTRA and talla_otra else None,
        ticket_path=filename,
        ticket_mime=mime,
    )
    db.add(camper)
    db.commit()
    db.refresh(camper)

    return CamperCreateResponse(folio=camper.folio, nombre=camper.nombre)
