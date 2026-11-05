from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..comprobante_ocr import TIPOS
from ..conciliacion import TIPOS_DINERO, agrupar
from ..config import settings
from ..database import get_db
from ..models import AdminRole, AdminUser, Camper
from ..procesar_comprobantes import estado_lote, procesar_lote
from ..schemas import (
    CamperOut,
    ComprobanteMiembroOut,
    ComprobanteUpdate,
    ConciliacionGrupoOut,
    ConciliacionResponse,
    ConciliacionResumen,
    ProcesarEstadoOut,
    RevisadoUpdate,
)
from ..security import get_current_admin, require_role

# Solo quienes verifican pagos (y Admin) ven y corrigen la conciliación.
_ROLES = (AdminRole.ADMIN, AdminRole.VERIFICADOR_PAGO)

router = APIRouter(prefix="/api/admin", tags=["comprobantes"], dependencies=[Depends(get_current_admin)])


def _gravedad(g) -> int:
    """0 = con alerta alta, 1 = alerta media, 2 = sin alertas, 3 = ya revisado."""
    if g.estado == "revisado":
        return 3
    if any(a.nivel == "alta" for a in g.alertas):
        return 0
    return 1 if g.estado == "alerta" else 2


@router.get("/conciliacion", response_model=ConciliacionResponse)
def conciliacion(_: AdminUser = Depends(require_role(*_ROLES)), db: Session = Depends(get_db)):
    campers = db.query(Camper).all()
    por_id = {c.id: c for c in campers}
    grupos, _motivos = agrupar(campers)

    salida: list[ConciliacionGrupoOut] = []
    for g in sorted(grupos, key=lambda g: (_gravedad(g), -(g.fecha.toordinal() if g.fecha else 0))):
        salida.append(
            ConciliacionGrupoOut(
                id=g.ids[0],
                estado=g.estado,
                tipo=g.tipo,
                monto_centavos=g.monto_centavos,
                fecha=g.fecha,
                tarifa=g.tarifa,
                esperado_centavos=g.esperado,
                cubre=g.cubre,
                por_que_juntos=g.por_que_juntos,
                alertas=[{"codigo": a.codigo, "nivel": a.nivel, "texto": a.texto} for a in g.alertas],
                miembros=[ComprobanteMiembroOut.model_validate(por_id[i]) for i in g.ids],
            )
        )

    con_ticket = [c for c in campers if c.ticket_path]
    # INCOMPLETO = se leyó algo (p. ej. monto) pero falta un dato, típico de capturas cortadas
    # sin fecha: cuenta como leído; "sin leer" son solo PENDIENTE/ERROR.
    leidos = sum(1 for c in con_ticket if c.ocr_estado in ("LEIDO", "INCOMPLETO") or c.comp_editado)
    dinero = [g for g in grupos if g.tipo in TIPOS_DINERO and g.monto_centavos]
    resumen = ConciliacionResumen(
        con_comprobante=len(con_ticket),
        sin_comprobante=len(campers) - len(con_ticket),
        leidos=leidos,
        sin_leer=len(con_ticket) - leidos,
        grupos=len(grupos),
        grupos_con_alerta=sum(1 for g in grupos if g.estado == "alerta"),
        grupos_compartidos=sum(1 for g in grupos if len(g.ids) > 1),
        grupos_revisados=sum(1 for g in grupos if g.revisado),
        dinero_leido_centavos=sum(g.monto_centavos for g in dinero),
        dinero_esperado_centavos=sum(g.esperado or 0 for g in dinero),
        lector="gemini" if settings.gemini_api_key else "local",
    )
    return ConciliacionResponse(resumen=resumen, grupos=salida)


@router.post("/comprobantes/procesar", response_model=ProcesarEstadoOut, status_code=status.HTTP_202_ACCEPTED)
def procesar(
    background: BackgroundTasks,
    todos: bool = False,
    _: AdminUser = Depends(require_role(*_ROLES)),
):
    if not estado_lote["corriendo"]:
        background.add_task(procesar_lote, todos)
        # se marca ya para que el primer GET de la UI vea "corriendo" aunque la tarea no haya arrancado
        estado_lote.update(corriendo=True, total=0, hechos=0, error=None)
    return estado_lote


@router.get("/comprobantes/procesar/estado", response_model=ProcesarEstadoOut)
def procesar_estado(_: AdminUser = Depends(require_role(*_ROLES))):
    return estado_lote


@router.patch("/registros/{camper_id}/comprobante", response_model=CamperOut)
def corregir_comprobante(
    camper_id: int,
    payload: ComprobanteUpdate,
    _: AdminUser = Depends(require_role(*_ROLES)),
    db: Session = Depends(get_db),
):
    camper = db.get(Camper, camper_id)
    if not camper or not camper.ticket_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro o comprobante no encontrado")
    datos = payload.model_dump(exclude_unset=True)
    if datos.get("comp_tipo") and datos["comp_tipo"] not in TIPOS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tipo de comprobante inválido")
    if "monto_pesos" in datos:
        m = datos.pop("monto_pesos")
        camper.comp_monto_centavos = None if m is None else round(m * 100)
    for campo, valor in datos.items():
        if isinstance(valor, str):
            valor = valor.strip() or None
        setattr(camper, campo, valor)
    # lo corregido a mano manda: una relectura automática ya no lo pisa
    camper.comp_editado = True
    camper.ocr_estado = "LEIDO"
    camper.ocr_fuente = "manual"
    db.commit()
    db.refresh(camper)
    return camper


@router.patch("/comprobantes/revisado")
def marcar_revisado(
    payload: RevisadoUpdate,
    admin: AdminUser = Depends(require_role(*_ROLES)),
    db: Session = Depends(get_db),
):
    campers = db.query(Camper).filter(Camper.id.in_(payload.ids)).all()
    if len(campers) != len(set(payload.ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Algún registro no existe")
    for c in campers:
        c.comp_revisado = payload.revisado
        c.comp_revisado_en = datetime.now(timezone.utc) if payload.revisado else None
        c.comp_revisado_por = admin.username if payload.revisado else None
        c.comp_nota = (payload.nota or None) if payload.revisado else None
    db.commit()
    return {"ok": True, "ids": payload.ids}
