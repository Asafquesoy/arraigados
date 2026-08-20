import logging
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..equipos_balance import Criterios, construir_contexto, elegir_equipo
from ..models import AppSettings, Camper, Equipo, Sexo, TallaCamisa, TipoParticipante, Zona
from ..ratelimit import rate_limit
from ..schemas import CamperCreateResponse
from ..storage import save_ticket
from .equipos import criterios_desde_settings

logger = logging.getLogger("arraigados")

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
    tipo: TipoParticipante = Form(...),
    telefono: str | None = Form(default=None, max_length=30),
    bautizado: bool | None = Form(default=None),
    bautismo_mes: int | None = Form(default=None, ge=1, le=12),
    bautismo_anio: int | None = Form(default=None, ge=1960),
    fecha_pago: date = Form(...),
    tiene_promocion: bool = Form(...),
    promocion_detalle: str | None = Form(default=None, max_length=200),
    talla_camisa: TallaCamisa | None = Form(default=None),
    talla_otra: str | None = Form(default=None, max_length=50),
    ticket: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    # No confiar en el cliente para decidir si el registro sigue abierto o si
    # el comprobante es obligatorio — se consulta app_settings aquí (el
    # toggle admin puede haber cambiado entre que el navegador cargó el
    # formulario y este POST).
    settings_row = db.get(AppSettings, 1)
    registro_abierto = settings_row.registro_abierto if settings_row else True
    if not registro_abierto:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "El registro está cerrado por ahora.")

    if tipo == TipoParticipante.CAMPERO and bautizado is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Indica si estás bautizado.")
    if tipo == TipoParticipante.CONSEJERO and not (telefono or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Indica tu número de teléfono.")
    if tipo == TipoParticipante.CAMPERO and bautizado and (bautismo_mes is None or bautismo_anio is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Indica la fecha de tu bautismo.")
    if tipo == TipoParticipante.CAMPERO and bautizado and bautismo_mes is not None and bautismo_anio is not None:
        hoy = date.today()
        if (bautismo_anio, bautismo_mes) > (hoy.year, hoy.month):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La fecha de tu bautismo no puede ser futura.")
    if tiene_promocion and not (promocion_detalle or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Menciona qué promoción obtuviste.")
    if talla_camisa == TallaCamisa.OTRA and not (talla_otra or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Menciona qué talla necesitas.")

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
        tipo=tipo,
        telefono=telefono.strip() if tipo == TipoParticipante.CONSEJERO and telefono else None,
        bautizado=bautizado if tipo == TipoParticipante.CAMPERO else None,
        bautismo_mes=bautismo_mes if tipo == TipoParticipante.CAMPERO and bautizado else None,
        bautismo_anio=bautismo_anio if tipo == TipoParticipante.CAMPERO and bautizado else None,
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

    # Reparto automático a un equipo — nunca debe tumbar el registro en sí
    # (que ya se guardó): un fallo aquí solo deja a la persona en "Sin
    # equipo", recogible después con el botón "Repartir a todos". Los
    # consejeros quedan siempre fuera de esto: solo entran a un equipo si un
    # admin los mueve a mano (mismo criterio que equipos_balance.repartir()).
    try:
        if tipo == TipoParticipante.CAMPERO and (settings_row.equipos_auto if settings_row else True):
            equipos = db.query(Equipo).order_by(Equipo.orden.asc(), Equipo.id.asc()).all()
            if equipos:
                criterios = criterios_desde_settings(settings_row) if settings_row else Criterios()
                participantes = db.query(Camper).all()
                equipos_miembros: dict[int, list[Camper]] = {e.id: [] for e in equipos}
                for c in participantes:
                    if c.equipo_id in equipos_miembros:
                        equipos_miembros[c.equipo_id].append(c)
                contexto = construir_contexto(participantes, date.today())
                elegido = elegir_equipo(camper, equipos, equipos_miembros, contexto, criterios)
                camper.equipo_id = elegido.id
                db.commit()
    except Exception:
        db.rollback()
        logger.exception("No se pudo asignar equipo automáticamente al folio %s", camper.folio)

    return CamperCreateResponse(folio=camper.folio, nombre=camper.nombre)
