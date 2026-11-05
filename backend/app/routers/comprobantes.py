import json
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..comprobante_ocr import TIPOS
from ..conciliacion import TIPOS_DINERO, agrupar
from ..config import settings
from ..database import get_db
from ..historial import CAMPOS_COMPROBANTE, foto_comprobante, registrar
from ..models import AdminRole, AdminUser, Camper, ComprobanteEvento
from ..procesar_comprobantes import estado_lote, procesar_lote
from ..schemas import (
    AprobarUpdate,
    CamperOut,
    ComprobanteMiembroOut,
    ComprobanteUpdate,
    ConciliacionGrupoOut,
    ConciliacionResponse,
    ConciliacionResumen,
    EventoOut,
    ProcesarEstadoOut,
    RevisadoUpdate,
    SepararUpdate,
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


def _foto_grupo(g) -> dict:
    """Lo que se veía al aprobar/revisar: queda en el historial para poder volver a comprobarlo."""
    return {
        "tipo": g.tipo,
        "monto_centavos": g.monto_centavos,
        "fecha": g.fecha,
        "tarifa": g.tarifa,
        "cubre": g.cubre,
        "registros": len(g.ids),
        "por_que_juntos": g.por_que_juntos,
        "chequeos": [{"ok": c.ok, "texto": c.texto} for c in g.chequeos],
        "alertas": [{"nivel": a.nivel, "texto": a.texto} for a in g.alertas],
    }


def _grupo_de(db: Session, camper_id: int):
    """Grupo (de `agrupar`) al que pertenece el registro hoy, o None."""
    grupos, _ = agrupar(db.query(Camper).all())
    return next((g for g in grupos if camper_id in g.ids), None)


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
                chequeos=[{"codigo": c.codigo, "ok": c.ok, "texto": c.texto} for c in g.chequeos],
                clase=g.clase,
                separado=g.separado,
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
        verificados_individuales=sum(1 for g in grupos if g.revisado and g.clase == "individual"),
        verificados_grupales=sum(1 for g in grupos if g.revisado and g.clase == "grupal"),
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
    admin: AdminUser = Depends(require_role(*_ROLES)),
    db: Session = Depends(get_db),
):
    camper = db.get(Camper, camper_id)
    if not camper or not camper.ticket_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro o comprobante no encontrado")
    antes = foto_comprobante(camper)
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
    despues = foto_comprobante(camper)
    cambios = [c for c in CAMPOS_COMPROBANTE if antes[c] != despues[c]]
    if cambios:
        # si ya estaba aprobado, lo que se aprobó dejó de ser lo que hay: vuelve a "por revisar"
        quitar = camper.comp_revisado
        if quitar:
            camper.comp_revisado = False
            camper.comp_revisado_en = camper.comp_revisado_por = camper.comp_nota = None
        registrar(
            db,
            camper.id,
            "DATOS_CORREGIDOS",
            admin.username,
            antes={c: antes[c] for c in cambios},
            despues={c: despues[c] for c in cambios},
            revision_quitada=quitar,
        )
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
    grupo = _grupo_de(db, campers[0].id)
    for c in campers:
        c.comp_revisado = payload.revisado
        c.comp_revisado_en = datetime.now(timezone.utc) if payload.revisado else None
        c.comp_revisado_por = admin.username if payload.revisado else None
        c.comp_nota = (payload.nota or None) if payload.revisado else None
        registrar(
            db,
            c.id,
            "REVISADO" if payload.revisado else "REVISION_QUITADA",
            admin.username,
            nota=c.comp_nota,
            **(_foto_grupo(grupo) if payload.revisado and grupo else {}),
        )
    db.commit()
    return {"ok": True, "ids": payload.ids}


@router.post("/comprobantes/aprobar")
def aprobar(
    payload: AprobarUpdate,
    admin: AdminUser = Depends(require_role(*_ROLES)),
    db: Session = Depends(get_db),
):
    """Aprueba el pago: marca el grupo como revisado Y el pago de cada miembro como
    verificado, y guarda en el historial lo que se veía en ese momento."""
    campers = db.query(Camper).filter(Camper.id.in_(payload.ids)).all()
    if len(campers) != len(set(payload.ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Algún registro no existe")
    grupo = _grupo_de(db, campers[0].id)
    foto = _foto_grupo(grupo) if grupo else {}
    ahora = datetime.now(timezone.utc)
    for c in campers:
        c.comp_revisado = True
        c.comp_revisado_en = ahora
        c.comp_revisado_por = admin.username
        c.comp_nota = payload.nota or None
        registrar(db, c.id, "APROBADO", admin.username, nota=c.comp_nota, **foto)
        if not c.pago_verificado:
            c.pago_verificado = True
            c.verificado_en = ahora
            c.verificado_por = admin.username
            registrar(db, c.id, "PAGO_VERIFICADO", admin.username)
    db.commit()
    return {"ok": True, "ids": payload.ids}


@router.patch("/registros/{camper_id}/comprobante/separar")
def separar(
    camper_id: int,
    payload: SepararUpdate,
    admin: AdminUser = Depends(require_role(*_ROLES)),
    db: Session = Depends(get_db),
):
    """«No es el mismo pago»: saca el registro de su grupo (o lo deja volver a unirse).
    Los grupos que cambian pierden su «revisado», porque ya no son lo que se revisó."""
    camper = db.get(Camper, camper_id)
    if not camper or not camper.ticket_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro o comprobante no encontrado")
    if camper.comp_separado == payload.separado:
        return {"ok": True}
    por_id = {c.id: c for c in db.query(Camper).all()}
    antes = _grupo_de(db, camper.id)
    juntos = [por_id[i].folio for i in (antes.ids if antes else []) if i != camper.id]
    camper.comp_separado = payload.separado
    db.flush()
    despues = _grupo_de(db, camper.id)
    afectados = set(antes.ids if antes else []) | set(despues.ids if despues else []) | {camper.id}
    for i in afectados:
        c = por_id[i]
        if c.comp_revisado:
            c.comp_revisado = False
            c.comp_revisado_en = c.comp_revisado_por = c.comp_nota = None
            registrar(db, c.id, "REVISION_QUITADA", admin.username, motivo="cambió el grupo")
    nuevos = [por_id[i].folio for i in (despues.ids if despues else []) if i != camper.id]
    registrar(
        db,
        camper.id,
        "SEPARADO" if payload.separado else "UNIDO_DE_NUEVO",
        admin.username,
        antes_junto_con=juntos,
        ahora_junto_con=nuevos,
    )
    db.commit()
    return {"ok": True}


@router.get("/comprobantes/historial", response_model=list[EventoOut])
def historial(
    camper_id: int | None = None,
    limit: int = 300,
    _: AdminUser = Depends(require_role(*_ROLES)),
    db: Session = Depends(get_db),
):
    q = db.query(ComprobanteEvento, Camper).join(Camper, Camper.id == ComprobanteEvento.camper_id)
    if camper_id is not None:
        q = q.filter(ComprobanteEvento.camper_id == camper_id)
    filas = q.order_by(ComprobanteEvento.creado_en.desc(), ComprobanteEvento.id.desc()).limit(min(max(limit, 1), 1000)).all()
    return [
        EventoOut(
            id=e.id,
            camper_id=e.camper_id,
            folio=c.folio,
            nombre=c.nombre,
            creado_en=e.creado_en,
            usuario=e.usuario,
            accion=e.accion,
            detalle=json.loads(e.detalle) if e.detalle else None,
        )
        for e, c in filas
    ]
