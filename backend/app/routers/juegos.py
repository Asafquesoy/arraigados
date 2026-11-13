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

El tercer modo, `torneo` (Voleibol gigante), no usa hojas: se sortea la ronda 1, se captura el marcador de
cada partido y la app va armando la tabla, la ronda 2 y las finales (`/{clave}/torneo/...`, al final del
archivo). Todo se guarda como filas de `calificaciones` (ver `voleibol.py`), sin migración.
"""

import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import voleibol
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
    DesempatePost,
    EmpateOut,
    EquipoRefOut,
    EstacionOut,
    FilaTablaOut,
    HojaCreate,
    HojaEstacionPut,
    HojaOut,
    HojaUpdate,
    JuegoDetalleOut,
    JuegoOut,
    LugarFinalOut,
    MarcadorPut,
    PartidoOut,
    PosicionesOut,
    PosicionOut,
    PropuestaOut,
    PropuestaPartidoOut,
    PuntosExtraCreate,
    PuntosExtraOut,
    PuntosExtraUpdate,
    ResultadoEquipoOut,
    SiguienteOut,
    TorneoOut,
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
_ES_TORNEO = "Este juego es un torneo: se captura con el sorteo, los marcadores de cada partido y las finales, no con hojas."


def _no_es_de_hojas(juego: Juego) -> None:
    """422 para los juegos que no se capturan con hojas de juez (estaciones y torneo)."""
    if juego.modo == "estaciones":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, _ES_DE_ESTACIONES)
    if juego.modo == "torneo":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, _ES_TORNEO)


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
    _no_es_de_hojas(juego)

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
    juego = obtener_juego(hoja.juego)
    if juego and juego.modo == "torneo":  # borrar un partido suelto rompería el torneo
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, _ES_TORNEO)
    db.delete(hoja)
    db.commit()


@router.get("/{clave}", response_model=JuegoDetalleOut)
def detalle_juego(clave: str, db: Session = Depends(get_db)):
    juego = _juego_o_404(clave)
    equipos = _equipos(db)
    por_id = {e.id: e for e in equipos}
    extras = [x for x in _todos_los_extra(db) if x.juego == clave]
    filas = _resultados_de(db, juego, equipos, extras)
    torneo: TorneoOut | None = None
    if juego.modo == "torneo":
        hojas = []  # las filas de `calificaciones` son partidos y desempates: viajan dentro de `torneo`
        torneo = _respuesta_torneo(db, juego)
    else:
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
        torneo=torneo,
    )


@router.post("/{clave}/hojas", response_model=HojaOut, status_code=status.HTTP_201_CREATED)
def crear_hoja(
    clave: str,
    payload: HojaCreate,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    juego = _juego_o_404(clave)
    _no_es_de_hojas(juego)
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


# ---- Torneo (Voleibol gigante) --------------------------------------------------------------


def _torneo_o_422(clave: str) -> Juego:
    juego = _juego_o_404(clave)
    if juego.modo != "torneo":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Este juego no es un torneo.")
    return juego


def _leer_torneo(db: Session, juego: Juego) -> tuple[list[Equipo], voleibol.Estado]:
    equipos = _equipos(db)
    filas = db.query(Calificacion).filter(Calificacion.juego == juego.clave).all()
    partidos, desempates = voleibol.leer_filas([(h.equipo_id, h.juez, h.valores) for h in filas])
    return equipos, voleibol.estado_torneo([e.id for e in equipos], partidos, desempates)


def _torneo_out(estado: voleibol.Estado, equipos: list[Equipo]) -> TorneoOut:
    por_id = {e.id: e for e in equipos}

    def ref(equipo_id: int) -> EquipoRefOut:
        return EquipoRefOut(id=equipo_id, nombre=por_id[equipo_id].nombre, color=por_id[equipo_id].color)

    sig = estado.siguiente
    jugando = sig.accion == "capturar"

    def partido(p: voleibol.Partido) -> PartidoOut:
        if p.saltado:
            situacion = "saltado"
        elif p.jugado:
            situacion = "jugado"
        elif jugando and p.slot == sig.en_cancha:
            situacion = "en_cancha"
        elif jugando and p.slot == sig.proximo:
            situacion = "proximo"
        else:
            situacion = "pendiente"
        return PartidoOut(
            slot=p.slot,
            ronda=p.ronda,
            etiqueta=voleibol.etiqueta_slot(p.slot),
            a=ref(p.a),
            b=ref(p.b),
            pa=p.pa if p.jugado else None,
            pb=p.pb if p.jugado else None,
            termino=p.termino if p.jugado else None,
            jugado=p.jugado,
            saltado=p.saltado,
            ganador_id=p.ganador,
            estado=situacion,
        )

    def tabla(filas: list[voleibol.FilaTabla] | None) -> list[FilaTablaOut] | None:
        if filas is None:
            return None
        return [
            FilaTablaOut(
                equipo=ref(f.equipo_id),
                lugar=f.lugar,
                jugados=f.jugados,
                victorias=f.victorias,
                f=f.f,
                c=f.c,
                dif=f.dif,
                empate=f.empate,
                por_volado=f.por_volado,
            )
            for f in filas
        ]

    def nombre(equipo_id: int) -> str:
        return por_id[equipo_id].nombre

    propuesta: PropuestaOut | None = None
    if estado.propuesta:
        pr = estado.propuesta
        propuesta = PropuestaOut(
            tipo=pr.tipo,
            partidos=[
                PropuestaPartidoOut(slot=slot, etiqueta=voleibol.etiqueta_slot(slot), a=ref(a), b=ref(b))
                for slot, a, b in pr.partidos
            ],
            cambios=[
                f"{nombre(a)} y {nombre(b)} ya jugaron en la ronda 1: {nombre(sube)} se cambia con {nombre(con)}."
                for a, b, sube, con in pr.cambios
            ],
            ajustada=pr.ajustada,
            con_revancha=pr.con_revancha,
        )

    lugares: list[LugarFinalOut] | None = None
    if estado.lugares:
        lugares = sorted(
            (
                LugarFinalOut(
                    equipo=ref(e), lugar=lugar, puntos=voleibol.puntos_de_lugar(lugar), origen=estado.origen_lugar.get(e, "tabla")
                )
                for e, lugar in estado.lugares.items()
            ),
            key=lambda x: (x.lugar, x.equipo.nombre),
        )

    avisos = list(estado.avisos)
    if estado.fuera:
        avisos.append(
            f"Estos equipos se crearon después del sorteo y no están en el torneo: {', '.join(nombre(e) for e in estado.fuera)}. "
            "Si deben jugar, reinicia el torneo y vuelve a sortear."
        )
    if estado.partidos_rotos:
        avisos.append(f"{estado.partidos_rotos} partido(s) mencionan un equipo que ya no existe y se ignoran. Reinicia el torneo.")

    return TorneoOut(
        fase=estado.fase,
        definitivo=estado.definitivo,
        n_equipos=len(estado.participantes),
        partidos=[partido(p) for p in estado.partidos],
        tabla_r1=tabla(estado.tabla_r1),
        tabla_r2=tabla(estado.tabla_r2),
        empates=[
            EmpateOut(
                ronda=e.ronda,
                equipos=[ref(i) for i in e.equipos],
                primero=e.primero,
                ultimo=e.ultimo,
                tipo=e.tipo,
                bloquea=e.bloquea,
            )
            for e in estado.empates
        ],
        siguiente=SiguienteOut(accion=sig.accion, faltan=sig.faltan, en_cancha=sig.en_cancha, proximo=sig.proximo),
        propuesta=propuesta,
        lugares=lugares,
        tercero_saltado=estado.tercero_saltado,
        hay_marcadores=any(p.jugado or p.saltado for p in estado.partidos),
        avisos=avisos,
    )


def _respuesta_torneo(db: Session, juego: Juego) -> TorneoOut:
    equipos, estado = _leer_torneo(db, juego)
    return _torneo_out(estado, equipos)


def _fila_partido(clave: str, slot: str, a: int, b: int, usuario: str) -> Calificacion:
    return Calificacion(
        juego=clave,
        equipo_id=a,
        juez=slot,
        valores={"b": b, "pa": None, "pb": None, "termino": None},
        creado_por=usuario,
    )


def _commit_torneo(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        # Dos personas armaron lo mismo a la vez y chocaron al crear la misma fila.
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Alguien más hizo este cambio al mismo tiempo. Recarga para ver lo último.",
        )


@router.post("/{clave}/torneo/sorteo", response_model=TorneoOut)
def sortear_ronda1(
    clave: str,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Sortea la ronda 1 (los equipos se sacan de dos en dos). Se puede repetir mientras nadie haya
    capturado un marcador; con alguno ya no, para no perder resultados."""
    juego = _torneo_o_422(clave)
    equipos, estado = _leer_torneo(db, juego)
    if any(p.jugado or p.saltado for p in estado.partidos):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Ya hay marcadores capturados. Si quieres sortear de nuevo, reinicia el torneo."
        )
    try:
        pares = voleibol.sorteo([e.id for e in equipos])
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    db.query(Calificacion).filter(Calificacion.juego == clave).delete(synchronize_session=False)
    for n, (a, b) in enumerate(pares, start=1):
        db.add(_fila_partido(clave, f"r1-{n}", a, b, admin.username))
    _commit_torneo(db)
    return _respuesta_torneo(db, juego)


@router.put("/{clave}/torneo/partidos/{slot}", response_model=TorneoOut)
def guardar_marcador(
    clave: str,
    slot: str,
    payload: MarcadorPut,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Anota (o corrige, o con `limpiar` borra) el marcador de un partido. Los puntos no se capturan:
    con el marcador se calcula la tabla."""
    juego = _torneo_o_422(clave)
    fila = db.query(Calificacion).filter(Calificacion.juego == clave, Calificacion.juez == slot).first() if voleibol.es_slot(slot) else None
    if not fila:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partido no encontrado")
    if fila.valores.get("saltado"):
        raise HTTPException(status.HTTP_409_CONFLICT, "El tercer lugar está marcado como saltado. Quita «Saltar» para capturarlo.")

    if payload.limpiar:
        pa = pb = termino = None
    else:
        try:
            pa, pb, termino = voleibol.validar_marcador(payload.pa, payload.pb, payload.termino)
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    fila.valores = {**fila.valores, "pa": pa, "pb": pb, "termino": termino}  # dict nuevo: así el JSON se guarda
    fila.actualizado_en = datetime.now(timezone.utc)
    fila.actualizado_por = admin.username
    db.commit()
    return _respuesta_torneo(db, juego)


@router.post("/{clave}/torneo/desempates", response_model=TorneoOut)
def resolver_empate(
    clave: str,
    payload: DesempatePost,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Resuelve un empate exacto de la tabla. Sin `orden`, la app hace el volado al azar; con `orden` se
    registra lo que se decidió en la cancha (volado o punto de oro), el que gana primero."""
    juego = _torneo_o_422(clave)
    _, estado = _leer_torneo(db, juego)
    pedido = set(payload.equipos)
    empate = next((e for e in estado.empates if e.ronda == payload.ronda and set(e.equipos) == pedido), None)
    if empate is None or len(pedido) != len(payload.equipos):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Ese empate ya no existe (cambió algún marcador). Recarga para ver los empates de ahora."
        )

    if payload.orden is None:
        orden = list(empate.equipos)
        random.SystemRandom().shuffle(orden)
        como = "app"
    else:
        if sorted(payload.orden) != sorted(empate.equipos):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "El orden debe incluir a todos los equipos empatados, una vez cada uno.")
        orden, como = list(payload.orden), "cancha"

    juez = f"volado-{payload.ronda}-" + "-".join(str(i) for i in sorted(empate.equipos))
    db.query(Calificacion).filter(Calificacion.juego == clave, Calificacion.juez == juez).delete(synchronize_session=False)
    db.add(
        Calificacion(
            juego=clave,
            equipo_id=min(empate.equipos),
            juez=juez,
            valores={"orden": orden, "como": como},
            creado_por=admin.username,
        )
    )
    _commit_torneo(db)
    return _respuesta_torneo(db, juego)


@router.post("/{clave}/torneo/ronda2", response_model=TorneoOut)
def armar_ronda2(
    clave: str,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Arma la ronda 2 por la tabla (1.º–2.º, 3.º–4.º…, sin revanchas). Solo con la ronda 1 completa y sin empates."""
    juego = _torneo_o_422(clave)
    _, estado = _leer_torneo(db, juego)
    if estado.siguiente.accion != "armar_ronda2" or not estado.propuesta:
        raise HTTPException(status.HTTP_409_CONFLICT, _por_que_no(estado, "la ronda 2", "ronda1"))
    for slot, a, b in estado.propuesta.partidos:
        db.add(_fila_partido(clave, slot, a, b, admin.username))
    _commit_torneo(db)
    return _respuesta_torneo(db, juego)


@router.post("/{clave}/torneo/finales", response_model=TorneoOut)
def armar_finales(
    clave: str,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Arma el tercer lugar (3.º–4.º) y la gran final (1.º–2.º) con la tabla tras la ronda 2."""
    juego = _torneo_o_422(clave)
    _, estado = _leer_torneo(db, juego)
    if estado.siguiente.accion != "armar_finales" or not estado.propuesta:
        raise HTTPException(status.HTTP_409_CONFLICT, _por_que_no(estado, "las finales", "ronda2"))
    for slot, a, b in estado.propuesta.partidos:
        db.add(_fila_partido(clave, slot, a, b, admin.username))
    _commit_torneo(db)
    return _respuesta_torneo(db, juego)


def _por_que_no(estado: voleibol.Estado, que: str, fase_esperada: str) -> str:
    """Motivo (en español) por el que todavía no se puede armar la siguiente ronda."""
    if estado.fase != fase_esperada:
        return f"Todavía no toca armar {que}."
    sig = estado.siguiente
    if sig.accion == "capturar":
        return f"Faltan {sig.faltan} partido(s) por capturar antes de armar {que}."
    if sig.accion == "desempatar":
        return f"Hay empates por resolver (volado) antes de armar {que}."
    return f"Todavía no se puede armar {que}."


@router.post("/{clave}/torneo/tercero/saltar", response_model=TorneoOut)
def saltar_tercero(
    clave: str,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """«Solo si hay tiempo»: se salta el tercer lugar y el 3.º y el 4.º se quedan como estaban en la tabla."""
    return _marcar_tercero_saltado(clave, True, db)


@router.delete("/{clave}/torneo/tercero/saltar", response_model=TorneoOut)
def no_saltar_tercero(
    clave: str,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    return _marcar_tercero_saltado(clave, False, db)


def _marcar_tercero_saltado(clave: str, saltado: bool, db: Session) -> TorneoOut:
    juego = _torneo_o_422(clave)
    fila = db.query(Calificacion).filter(Calificacion.juego == clave, Calificacion.juez == "tercero").first()
    if not fila:
        raise HTTPException(status.HTTP_409_CONFLICT, "Primero hay que armar las finales.")
    if saltado and fila.valores.get("pa") is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "El tercer lugar ya tiene marcador. Bórralo primero si quieres saltarlo."
        )
    fila.valores = {**fila.valores, "saltado": saltado}
    db.commit()
    return _respuesta_torneo(db, juego)


@router.delete("/{clave}/torneo/{fase}", response_model=TorneoOut)
def deshacer_fase(
    clave: str,
    fase: str,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Deshace la última ronda armada (`ronda2` o `finales`) si todavía no tiene marcadores, para armarla de
    nuevo (p. ej. porque se corrigió un marcador de la ronda anterior)."""
    juego = _torneo_o_422(clave)
    if fase not in ("ronda2", "finales"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fase no encontrada")
    _, estado = _leer_torneo(db, juego)
    if fase == "ronda2":
        if estado.final or estado.tercero:
            raise HTTPException(status.HTTP_409_CONFLICT, "Primero deshaz las finales.")
        if not estado.r2:
            raise HTTPException(status.HTTP_409_CONFLICT, "La ronda 2 todavía no está armada.")
        if any(p.jugado for p in estado.r2):
            raise HTTPException(status.HTTP_409_CONFLICT, "La ronda 2 ya tiene marcadores. Bórralos antes de deshacerla.")
        filtro = (Calificacion.juez.like("r2-%")) | (Calificacion.juez.like("volado-r2-%"))
    else:
        if not (estado.final or estado.tercero):
            raise HTTPException(status.HTTP_409_CONFLICT, "Las finales todavía no están armadas.")
        if any(p.jugado for p in (estado.final, estado.tercero) if p):
            raise HTTPException(status.HTTP_409_CONFLICT, "Las finales ya tienen marcadores. Bórralos antes de deshacerlas.")
        filtro = Calificacion.juez.in_(["tercero", "final"])
    db.query(Calificacion).filter(Calificacion.juego == clave, filtro).delete(synchronize_session=False)
    db.commit()
    return _respuesta_torneo(db, juego)


@router.delete("/{clave}/torneo", response_model=TorneoOut)
def reiniciar_torneo(
    clave: str,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Borra todo el torneo (sorteo, marcadores y desempates) para empezar de cero."""
    juego = _torneo_o_422(clave)
    db.query(Calificacion).filter(Calificacion.juego == clave).delete(synchronize_session=False)
    db.commit()
    return _respuesta_torneo(db, juego)
