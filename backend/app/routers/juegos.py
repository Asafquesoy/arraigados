"""Calificaciones de los juegos por equipo (`/admin/juegos`).

Cualquier cuenta del panel puede ver; solo Admin captura, corrige y borra hojas. El catálogo
de juegos y las cuentas viven en `juegos.py` (puro); aquí solo se arma la respuesta.

Hay dos modos de juego. En `jueces` (Sketch) cada hoja es de un juez (`POST .../hojas`, `PATCH`/
`DELETE /hojas/{id}`). En `estaciones` (Rally sucio, Búsqueda del tesoro) se captura la hoja de papel
de una estación completa de un jalón con `PUT /{clave}/estaciones/{estacion}`: una fila por equipo en
`calificaciones`, con la clave de la estación en el campo `juez`.
Los puntos extra/descuentos (`/puntos-extra`, tabla `puntos_extra`) se suman al total del juego al que
se aplican (y mueven su posición) o, sin juego, solo al total general.
Las rutas literales (`/posiciones`, `/hojas/{id}`, `/puntos-extra`) van antes de `/{clave}`.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..juegos import (
    JUEGOS,
    Juego,
    obtener_juego,
    puntos_fila,
    puntos_hoja,
    resultados,
    tabla_general,
    validar_fila,
    validar_lugares_capilla,
    validar_valores,
)
from ..models import AdminRole, AdminUser, Calificacion, Equipo, PuntosExtra
from ..schemas import (
    CriterioOut,
    EstacionOut,
    HojaCreate,
    HojaEstacionPut,
    HojaOut,
    HojaUpdate,
    JuegoDetalleOut,
    JuegoOut,
    PosicionesOut,
    PosicionOut,
    PuntosExtraCreate,
    PuntosExtraOut,
    PuntosExtraUpdate,
    ResultadoEquipoOut,
)
from ..security import get_current_admin, require_role

router = APIRouter(
    prefix="/api/admin/juegos",
    tags=["juegos"],
    dependencies=[Depends(get_current_admin)],
)

_JUEZ_REPETIDO = "Ese juez ya calificó a este equipo en este juego. Edita su hoja en lugar de crear otra."


def _juego_out(j: Juego) -> JuegoOut:
    return JuegoOut(
        clave=j.clave,
        nombre=j.nombre,
        descripcion=j.descripcion,
        puntos_max=j.puntos_max,
        modo=j.modo,
        estaciones=[
            EstacionOut(
                clave=e.clave,
                nombre=e.nombre,
                tipo=e.tipo,
                subtitulo=e.subtitulo,
                limite_seg=e.limite_seg,
                avance=e.avance,
                etiqueta_avance=e.etiqueta_avance,
                total_sugerido=e.total_sugerido,
                orden_equipos=list(e.orden_equipos),
                puntos_max=e.puntos_max,
            )
            for e in j.estaciones
        ],
        criterios=[
            CriterioOut(
                clave=c.clave,
                nombre=c.nombre,
                descripcion=c.descripcion,
                tipo=c.tipo,
                puntos=c.puntos,
                escala_max=c.escala_max,
            )
            for c in j.criterios
        ],
    )


def _juego_o_404(clave: str) -> Juego:
    juego = obtener_juego(clave)
    if not juego:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Juego no encontrado")
    return juego


def _equipos(db: Session) -> list[Equipo]:
    return db.query(Equipo).order_by(Equipo.orden.asc(), Equipo.id.asc()).all()


def _hoja_out(h: Calificacion, juego: Juego) -> HojaOut:
    if juego.modo == "estaciones":
        # Una fila de una estación que ya no está en el catálogo se muestra en 0 en vez de romper la pantalla.
        est = juego.estacion(h.juez)
        por_criterio, total = puntos_fila(est, h.valores) if est else ({}, 0.0)
    else:
        por_criterio, total = puntos_hoja(juego, h.valores)
    return HojaOut(
        id=h.id,
        juego=h.juego,
        equipo_id=h.equipo_id,
        juez=h.juez,
        valores=h.valores,
        puntos={k: round(v, 1) for k, v in por_criterio.items()},
        total=round(total, 1),
        creado_en=h.creado_en,
        creado_por=h.creado_por,
        actualizado_en=h.actualizado_en,
        actualizado_por=h.actualizado_por,
    )


def _limpiar_juez(texto: str) -> str:
    """Quita espacios sobrantes ("  Juez   1 " → "Juez 1")."""
    juez = " ".join(texto.split())
    if not juez:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escribe el nombre o número del juez.")
    return juez


_ES_DE_ESTACIONES = "Este juego se captura por estación, con la hoja completa de cada una."


def _valores_o_422(juego: Juego, valores: dict) -> dict:
    try:
        return validar_valores(juego, valores)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


def _hay_duplicada(db: Session, juego: str, equipo_id: int, juez: str, excluir_id: int | None = None) -> bool:
    q = db.query(Calificacion.id).filter(
        Calificacion.juego == juego,
        Calificacion.equipo_id == equipo_id,
        func.lower(Calificacion.juez) == juez.lower(),
    )
    if excluir_id is not None:
        q = q.filter(Calificacion.id != excluir_id)
    return q.first() is not None


def _extra_por_equipo(extras: list[PuntosExtra], juego: str | None) -> dict[int, float]:
    """Suma de puntos extra por equipo para un juego (`None` = los generales)."""
    suma: dict[int, float] = {}
    for x in extras:
        if x.juego == juego:
            suma[x.equipo_id] = suma.get(x.equipo_id, 0.0) + x.puntos
    return suma


def _todos_los_extra(db: Session) -> list[PuntosExtra]:
    return db.query(PuntosExtra).order_by(PuntosExtra.creado_en.desc(), PuntosExtra.id.desc()).all()


def _resultados_de(db: Session, juego: Juego, equipos: list[Equipo], extras: list[PuntosExtra]):
    hojas = db.query(Calificacion).filter(Calificacion.juego == juego.clave).all()
    return resultados(
        juego,
        [e.id for e in equipos],
        [(h.equipo_id, h.juez, h.valores) for h in hojas],
        _extra_por_equipo(extras, juego.clave),
    )


@router.get("", response_model=list[JuegoOut])
def listar_juegos():
    return [_juego_out(j) for j in JUEGOS]


@router.get("/posiciones", response_model=PosicionesOut)
def posiciones(db: Session = Depends(get_db)):
    equipos = _equipos(db)
    por_id = {e.id: e for e in equipos}
    extras = _todos_los_extra(db)
    por_juego = {j.clave: _resultados_de(db, j, equipos, extras) for j in JUEGOS}
    filas = tabla_general([e.id for e in equipos], por_juego, _extra_por_equipo(extras, None))
    return PosicionesOut(
        juegos=[_juego_out(j) for j in JUEGOS],
        equipos=[
            PosicionOut(
                equipo_id=f.equipo_id,
                nombre=por_id[f.equipo_id].nombre,
                color=por_id[f.equipo_id].color,
                por_juego=f.por_juego,
                posicion_por_juego=f.posicion_por_juego,
                extra=f.extra,
                total=f.total,
                posicion=f.posicion,
            )
            for f in filas
        ],
        puntos_extra=[PuntosExtraOut.model_validate(x) for x in extras],
    )


# ---- Puntos extra y descuentos (declarados antes de `/{clave}`) ----------------------------


def _juego_extra_o_422(juego: str | None) -> None:
    """`None` = general; si no, tiene que ser un juego del catálogo."""
    if juego is not None and not obtener_juego(juego):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ese juego no existe.")


@router.post("/puntos-extra", response_model=PuntosExtraOut, status_code=status.HTTP_201_CREATED)
def crear_puntos_extra(
    payload: PuntosExtraCreate,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    if not db.get(Equipo, payload.equipo_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipo no encontrado")
    _juego_extra_o_422(payload.juego)
    x = PuntosExtra(
        equipo_id=payload.equipo_id,
        juego=payload.juego,
        puntos=payload.puntos,
        motivo=payload.motivo,
        creado_por=admin.username,
    )
    db.add(x)
    db.commit()
    db.refresh(x)
    return x


@router.patch("/puntos-extra/{extra_id}", response_model=PuntosExtraOut)
def editar_puntos_extra(
    extra_id: int,
    payload: PuntosExtraUpdate,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    x = db.get(PuntosExtra, extra_id)
    if not x:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro no encontrado")
    cambios = payload.model_dump(exclude_unset=True)
    if cambios.get("equipo_id") is not None:
        if not db.get(Equipo, cambios["equipo_id"]):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipo no encontrado")
        x.equipo_id = cambios["equipo_id"]
    if "juego" in cambios:  # null explícito = pasar a general
        _juego_extra_o_422(cambios["juego"])
        x.juego = cambios["juego"]
    if cambios.get("puntos") is not None:
        x.puntos = cambios["puntos"]
    if cambios.get("motivo") is not None:
        x.motivo = cambios["motivo"]
    x.actualizado_en = datetime.now(timezone.utc)
    x.actualizado_por = admin.username
    db.commit()
    db.refresh(x)
    return x


@router.delete("/puntos-extra/{extra_id}", status_code=status.HTTP_204_NO_CONTENT)
def borrar_puntos_extra(
    extra_id: int,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    x = db.get(PuntosExtra, extra_id)
    if not x:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro no encontrado")
    db.delete(x)
    db.commit()


@router.patch("/hojas/{hoja_id}", response_model=HojaOut)
def editar_hoja(
    hoja_id: int,
    payload: HojaUpdate,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    hoja = db.get(Calificacion, hoja_id)
    juego = obtener_juego(hoja.juego) if hoja else None
    if not hoja or not juego:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hoja no encontrada")
    if juego.modo == "estaciones":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, _ES_DE_ESTACIONES)

    if payload.equipo_id is not None:
        if not db.get(Equipo, payload.equipo_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipo no encontrado")
        hoja.equipo_id = payload.equipo_id
    if payload.juez is not None:
        hoja.juez = _limpiar_juez(payload.juez)
    if payload.valores is not None:
        hoja.valores = _valores_o_422(juego, payload.valores)

    if _hay_duplicada(db, hoja.juego, hoja.equipo_id, hoja.juez, excluir_id=hoja.id):
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, _JUEZ_REPETIDO)

    hoja.actualizado_en = datetime.now(timezone.utc)
    hoja.actualizado_por = admin.username
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, _JUEZ_REPETIDO)
    db.refresh(hoja)
    return _hoja_out(hoja, juego)


@router.delete("/hojas/{hoja_id}", status_code=status.HTTP_204_NO_CONTENT)
def borrar_hoja(
    hoja_id: int,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    hoja = db.get(Calificacion, hoja_id)
    if not hoja:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hoja no encontrada")
    db.delete(hoja)
    db.commit()


@router.get("/{clave}", response_model=JuegoDetalleOut)
def detalle_juego(clave: str, db: Session = Depends(get_db)):
    juego = _juego_o_404(clave)
    equipos = _equipos(db)
    por_id = {e.id: e for e in equipos}
    extras = [x for x in _todos_los_extra(db) if x.juego == clave]
    filas = _resultados_de(db, juego, equipos, extras)
    hojas = (
        db.query(Calificacion)
        .filter(Calificacion.juego == clave)
        .order_by(Calificacion.creado_en.asc(), Calificacion.id.asc())
        .all()
    )
    return JuegoDetalleOut(
        juego=_juego_out(juego),
        equipos=[
            ResultadoEquipoOut(
                equipo_id=f.equipo_id,
                nombre=por_id[f.equipo_id].nombre,
                color=por_id[f.equipo_id].color,
                hojas=f.hojas,
                por_criterio=f.por_criterio,
                extra=f.extra,
                total=f.total,
                posicion=f.posicion,
                tiempo_seg=f.tiempo_seg,
            )
            for f in filas
        ],
        hojas=[_hoja_out(h, juego) for h in hojas],
        puntos_extra=[PuntosExtraOut.model_validate(x) for x in extras],
    )


@router.post("/{clave}/hojas", response_model=HojaOut, status_code=status.HTTP_201_CREATED)
def crear_hoja(
    clave: str,
    payload: HojaCreate,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    juego = _juego_o_404(clave)
    if juego.modo == "estaciones":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, _ES_DE_ESTACIONES)
    if not db.get(Equipo, payload.equipo_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipo no encontrado")
    juez = _limpiar_juez(payload.juez)
    valores = _valores_o_422(juego, payload.valores)
    if _hay_duplicada(db, clave, payload.equipo_id, juez):
        raise HTTPException(status.HTTP_409_CONFLICT, _JUEZ_REPETIDO)

    hoja = Calificacion(
        juego=clave,
        equipo_id=payload.equipo_id,
        juez=juez,
        valores=valores,
        creado_por=admin.username,
    )
    db.add(hoja)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, _JUEZ_REPETIDO)
    db.refresh(hoja)
    return _hoja_out(hoja, juego)


@router.put("/{clave}/estaciones/{estacion}", response_model=list[HojaOut])
def guardar_estacion(
    clave: str,
    estacion: str,
    payload: HojaEstacionPut,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Guarda la hoja completa de una estación. Los equipos que vienen se crean o se actualizan; los
    que ya estaban guardados y ya no vienen (renglón vaciado) se borran. Todo o nada: si un renglón
    no es válido no se guarda nada."""
    juego = _juego_o_404(clave)
    est = juego.estacion(estacion) if juego.modo == "estaciones" else None
    if not est:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Estación no encontrada")

    equipos = {e.id: e for e in _equipos(db)}
    ids = [f.equipo_id for f in payload.filas]
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Un equipo aparece dos veces en la hoja.")

    limpias: dict[int, dict] = {}
    for fila in payload.filas:
        equipo = equipos.get(fila.equipo_id)
        if not equipo:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipo no encontrado")
        try:
            limpias[fila.equipo_id] = validar_fila(est, fila.valores)
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{equipo.nombre}: {exc}") from exc
    if est.tipo == "capilla":
        try:
            validar_lugares_capilla(list(limpias.values()))
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    existentes = {
        h.equipo_id: h
        for h in db.query(Calificacion).filter(Calificacion.juego == clave, Calificacion.juez == estacion).all()
    }
    ahora = datetime.now(timezone.utc)
    for equipo_id, valores in limpias.items():
        hoja = existentes.get(equipo_id)
        if hoja is None:
            db.add(Calificacion(juego=clave, equipo_id=equipo_id, juez=estacion, valores=valores, creado_por=admin.username))
        elif hoja.valores != valores:
            hoja.valores = valores
            hoja.actualizado_en = ahora
            hoja.actualizado_por = admin.username
    for equipo_id, hoja in existentes.items():
        if equipo_id not in limpias:
            db.delete(hoja)

    try:
        db.commit()
    except IntegrityError:
        # Dos personas guardaron la misma estación a la vez y chocaron al crear la fila de un equipo.
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Alguien más guardó esta estación al mismo tiempo. Vuelve a abrirla para ver lo último y guarda de nuevo.",
        )

    hojas = (
        db.query(Calificacion)
        .filter(Calificacion.juego == clave, Calificacion.juez == estacion)
        .order_by(Calificacion.id.asc())
        .all()
    )
    return [_hoja_out(h, juego) for h in hojas]
