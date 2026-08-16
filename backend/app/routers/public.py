from fastapi import APIRouter, Depends, Form, UploadFile, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Camper, Sexo, TallaCamisa
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
    ciudad: str = Form(..., min_length=2, max_length=100),
    iglesia: str = Form(..., min_length=2, max_length=150),
    edad: int = Form(..., ge=5, le=99),
    sexo: Sexo = Form(...),
    talla_camisa: TallaCamisa | None = Form(default=None),
    ticket: UploadFile = ...,
    db: Session = Depends(get_db),
):
    filename, mime = await save_ticket(ticket)

    camper = Camper(
        nombre=nombre.strip(),
        ciudad=ciudad.strip(),
        iglesia=iglesia.strip(),
        edad=edad,
        sexo=sexo,
        talla_camisa=talla_camisa,
        ticket_path=filename,
        ticket_mime=mime,
    )
    db.add(camper)
    db.commit()
    db.refresh(camper)

    return CamperCreateResponse(folio=camper.folio, nombre=camper.nombre)
