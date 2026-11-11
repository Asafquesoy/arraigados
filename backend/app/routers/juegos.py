"""Calificaciones de los juegos por equipo (`/admin/juegos`).

Cualquier cuenta del panel puede ver; solo Admin captura, corrige y borra hojas. El catálogo
de juegos y las cuentas viven en `juegos.py` (puro); aquí solo se arma la respuesta.
Las rutas literales (`/posiciones`, `/hojas/{id}`) van antes de `/{clave}`.
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
    puntos_hoja,
    resultados,
    tabla_general,
    validar_valores,
)
from ..models import AdminRole, AdminUser, Calificacion, Equipo
from ..schemas import (
    CriterioOut,
    HojaCreate,
    HojaOut,
    HojaUpdate,
    JuegoDetalleOut,
    JuegoOut,
    PosicionesOut,
    PosicionOut,
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


def _resultados_de(db: Session, juego: Juego, equipos: list[Equipo]):
    hojas = db.query(Calificacion).filter(Calificacion.juego == juego.clave).all()
    return resultados(juego, [e.id for e in equipos], [(h.equipo_id, h.valores) for h in hojas])


@router.get("", response_model=list[JuegoOut])
def listar_juegos():
    return [_juego_out(j) for j in JUEGOS]


@router.get("/posiciones", response_model=PosicionesOut)
def posiciones(db: Session = Depends(get_db)):
    equipos = _equipos(db)
    por_id = {e.id: e for e in equipos}
    por_juego = {j.clave: _resultados_de(db, j, equipos) for j in JUEGOS}
    filas = tabla_general([e.id for e in equipos], por_juego)
    return PosicionesOut(
        juegos=[_juego_out(j) for j in JUEGOS],
        equipos=[
            PosicionOut(
                equipo_id=f.equipo_id,
                nombre=por_id[f.equipo_id].nombre,
                color=por_id[f.equipo_id].color,
                por_juego=f.por_juego,
                total=f.total,
                posicion=f.posicion,
            )
            for f in filas
        ],
    )


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
    filas = _resultados_de(db, juego, equipos)
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
                total=f.total,
                posicion=f.posicion,
            )
            for f in filas
        ],
        hojas=[_hoja_out(h, juego) for h in hojas],
    )


@router.post("/{clave}/hojas", response_model=HojaOut, status_code=status.HTTP_201_CREATED)
def crear_hoja(
    clave: str,
    payload: HojaCreate,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    juego = _juego_o_404(clave)
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
