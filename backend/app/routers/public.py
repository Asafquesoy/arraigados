import logging
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..database import get_db
from ..iglesias import canonicalizar_iglesia, iglesias_de_zona
from ..models import AppSettings, Camper, Sexo, TallaCamisa, TipoParticipante, Zona
from ..procesar_comprobantes import procesar_registro_nuevo
from ..ratelimit import rate_limit
from ..registro_sitio import guardar_con_folio_unico
from ..schemas import CamperCreateResponse
from ..storage import save_ticket
from ..validacion_camper import normalizar_datos_camper, validar_datos_camper
from .equipos import asignar_equipo_auto

logger = logging.getLogger("arraigados")

router = APIRouter(prefix="/api/registros", tags=["registro"])
iglesias_router = APIRouter(prefix="/api/iglesias", tags=["iglesias"])


@iglesias_router.get(
    "",
    response_model=list[str],
    dependencies=[Depends(rate_limit("iglesias", max_hits=120, window_seconds=600))],
)
def listar_iglesias(zona: Zona, db: Session = Depends(get_db)):
    """Nombres (solo nombres, nunca personas) de las iglesias ya registradas
    en una zona — alimenta el autocompletado del formulario público."""
    return iglesias_de_zona(db, zona)


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
    background: BackgroundTasks = BackgroundTasks(),
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

    validar_datos_camper(
        tipo=tipo,
        telefono=telefono,
        bautizado=bautizado,
        bautismo_mes=bautismo_mes,
        bautismo_anio=bautismo_anio,
        tiene_promocion=tiene_promocion,
        promocion_detalle=promocion_detalle,
        talla_camisa=talla_camisa,
        talla_otra=talla_otra,
    )

    pedir_comprobante = settings_row.pedir_comprobante if settings_row else True
    if pedir_comprobante and ticket is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sube tu comprobante de pago.")

    filename, mime = await save_ticket(ticket) if ticket is not None else (None, None)

    # Si lo escrito es igual (tras limpiar mayúsculas/acentos/relleno) a una
    # iglesia ya registrada en esa zona, se guarda con su nombre oficial.
    iglesia = canonicalizar_iglesia(db, iglesia, zona)

    camper = Camper(
        **normalizar_datos_camper(
            nombre=nombre,
            iglesia=iglesia,
            edad=edad,
            sexo=sexo,
            zona=zona,
            tipo=tipo,
            telefono=telefono,
            bautizado=bautizado,
            bautismo_mes=bautismo_mes,
            bautismo_anio=bautismo_anio,
            fecha_pago=fecha_pago,
            tiene_promocion=tiene_promocion,
            promocion_detalle=promocion_detalle,
            talla_camisa=talla_camisa,
            talla_otra=talla_otra,
        ),
        ticket_path=filename,
        ticket_mime=mime,
    )
    await run_in_threadpool(guardar_con_folio_unico, db, camper)
    db.refresh(camper)

    # Lectura del comprobante (huellas + monto/fecha/referencia) después de
    # responder; procesar_registro_nuevo nunca propaga errores.
    if camper.ticket_path:
        background.add_task(procesar_registro_nuevo, camper.id)

    # Reparto automático a un equipo — nunca debe tumbar el registro en sí
    # (que ya se guardó): un fallo aquí solo deja a la persona en "Sin
    # equipo", recogible después con el botón "Repartir a todos". Los
    # consejeros quedan siempre fuera de esto: solo entran a un equipo si un
    # admin los mueve a mano (mismo criterio que equipos_balance.repartir()).
    # Va en el threadpool porque puede esperar el candado de equipos (otro alta
    # o un reparto en curso) y eso no debe parar el event loop.
    try:
        await run_in_threadpool(asignar_equipo_auto, db, camper, settings_row)
    except Exception:
        db.rollback()
        logger.exception("No se pudo asignar equipo automáticamente al folio %s", camper.folio)

    return CamperCreateResponse(folio=camper.folio, nombre=camper.nombre)
