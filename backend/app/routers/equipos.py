from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from ..concurrencia import candado_equipos
from ..database import get_db
from ..equipos_balance import Criterios, construir_contexto, elegir_equipo, repartir, resumen_equipo
from ..models import AdminRole, AdminUser, AppSettings, Camper, Equipo, TipoParticipante
from ..schemas import (
    DistribucionOut,
    EquipoAsignacion,
    EquipoCreate,
    EquipoOut,
    EquiposConfig,
    EquiposConfigUpdate,
    EquipoStats,
    EquipoUpdate,
    MiembroOut,
    RepartirRequest,
)
from ..security import get_current_admin, require_role

router = APIRouter(prefix="/api/admin/equipos", tags=["equipos"], dependencies=[Depends(get_current_admin)])

_CONFIG_FIELDS = (
    "equipos_auto",
    "eq_balance_edad",
    "eq_balance_bautismo",
    "eq_balance_procedencia",
    "eq_balance_sexo",
    "eq_balance_tamano",
)


def _get_or_create_settings(db: Session) -> AppSettings:
    row = db.get(AppSettings, 1)
    if not row:
        # Mismo criterio que actualizar_settings() en admin.py: no debería pasar
        # (seed_settings() la crea al arrancar), pero no hace fallar la petición.
        row = AppSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def criterios_desde_settings(row: AppSettings) -> Criterios:
    return Criterios(
        edad=row.eq_balance_edad,
        bautismo=row.eq_balance_bautismo,
        procedencia=row.eq_balance_procedencia,
        sexo=row.eq_balance_sexo,
        tamano=row.eq_balance_tamano,
    )


def asignar_equipo_auto(db: Session, camper: Camper, settings_row: AppSettings | None) -> Equipo | None:
    """Mete a `camper` (ya guardado) en el equipo que menos desequilibra, y hace
    commit. Devuelve el equipo, o None si no aplica (consejero, staff,
    `equipos_auto` apagado o no hay equipos). Lo usan el alta pública y el alta
    en sitio.

    Entra al candado de equipos: lee los miembros actuales, decide y escribe sin
    que otro alta o un "Repartir a todos" se cuele en medio. El candado es
    reentrante, así que el alta en sitio puede tomarlo antes para cubrir también
    su chequeo de duplicados."""
    if camper.tipo != TipoParticipante.CAMPERO or camper.es_staff:
        return None
    if settings_row is not None and not settings_row.equipos_auto:
        return None

    with candado_equipos(db):
        equipos = db.query(Equipo).order_by(Equipo.orden.asc(), Equipo.id.asc()).all()
        if not equipos:
            return None
        criterios = criterios_desde_settings(settings_row) if settings_row else Criterios()
        participantes = db.query(Camper).filter(Camper.es_staff.is_(False)).all()
        equipos_miembros: dict[int, list[Camper]] = {e.id: [] for e in equipos}
        for c in participantes:
            if c.equipo_id in equipos_miembros:
                equipos_miembros[c.equipo_id].append(c)
        contexto = construir_contexto(participantes, date.today())
        elegido = elegir_equipo(camper, equipos, equipos_miembros, contexto, criterios)
        camper.equipo_id = elegido.id
        db.commit()
        return elegido


def _equipo_out(equipo: Equipo) -> EquipoOut:
    return EquipoOut(
        id=equipo.id,
        nombre=equipo.nombre,
        color=equipo.color,
        orden=equipo.orden,
        stats=EquipoStats(**resumen_equipo(equipo.miembros)),
        miembros=[MiembroOut.model_validate(m) for m in equipo.miembros],
    )


@router.get("/distribucion", response_model=DistribucionOut)
def obtener_distribucion(db: Session = Depends(get_db)):
    equipos = (
        db.query(Equipo)
        .options(joinedload(Equipo.miembros))
        .order_by(Equipo.orden.asc(), Equipo.id.asc())
        .all()
    )
    sin_equipo = (
        db.query(Camper)
        .filter(Camper.equipo_id.is_(None), Camper.es_staff.is_(False))
        .order_by(Camper.created_at.desc())
        .all()
    )
    staff = db.query(Camper).filter(Camper.es_staff.is_(True)).order_by(Camper.created_at.desc()).all()
    return DistribucionOut(
        equipos=[_equipo_out(e) for e in equipos],
        sin_equipo=[MiembroOut.model_validate(c) for c in sin_equipo],
        staff=[MiembroOut.model_validate(c) for c in staff],
    )


@router.post("", response_model=EquipoOut, status_code=status.HTTP_201_CREATED)
def crear_equipo(
    payload: EquipoCreate,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    if db.query(Equipo).filter(Equipo.nombre == payload.nombre).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un equipo con ese nombre.")

    max_orden = db.query(Equipo).count()
    equipo = Equipo(nombre=payload.nombre.strip(), color=payload.color, orden=max_orden)
    db.add(equipo)
    db.commit()
    db.refresh(equipo)
    return _equipo_out(equipo)


@router.get("/config", response_model=EquiposConfig)
def obtener_config(db: Session = Depends(get_db)):
    row = _get_or_create_settings(db)
    return EquiposConfig(**{field: getattr(row, field) for field in _CONFIG_FIELDS})


@router.patch("/config", response_model=EquiposConfig)
def actualizar_config(
    payload: EquiposConfigUpdate,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    row = _get_or_create_settings(db)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return EquiposConfig(**{field: getattr(row, field) for field in _CONFIG_FIELDS})


# Las rutas con "/{equipo_id}" van DESPUÉS de "/config" y "/repartir" a
# propósito: FastAPI resuelve las rutas en orden de registro, así que si
# "/{equipo_id}" se registrara primero, una petición a "/config" haría que
# equipo_id="config" fallara al intentar convertirse a int.
@router.patch("/{equipo_id}", response_model=EquipoOut)
def actualizar_equipo(
    equipo_id: int,
    payload: EquipoUpdate,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    equipo = db.get(Equipo, equipo_id)
    if not equipo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipo no encontrado")

    updates = payload.model_dump(exclude_unset=True)
    if "nombre" in updates:
        duplicado = (
            db.query(Equipo).filter(Equipo.nombre == updates["nombre"], Equipo.id != equipo_id).first()
        )
        if duplicado:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un equipo con ese nombre.")
    for field, value in updates.items():
        setattr(equipo, field, value)
    db.commit()
    db.refresh(equipo)
    return _equipo_out(equipo)


@router.delete("/{equipo_id}", status_code=status.HTTP_204_NO_CONTENT)
def borrar_equipo(
    equipo_id: int,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    equipo = db.get(Equipo, equipo_id)
    if not equipo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipo no encontrado")

    # Los miembros no se borran — ON DELETE SET NULL (en Postgres) más este
    # UPDATE explícito (necesario también en SQLite, que no aplica la FK) los
    # dejan en "Sin equipo".
    db.query(Camper).filter(Camper.equipo_id == equipo_id).update(
        {Camper.equipo_id: None, Camper.equipo_fijado: False}
    )
    db.delete(equipo)
    db.commit()


@router.post("/repartir", response_model=DistribucionOut)
def repartir_equipos(
    payload: RepartirRequest,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    equipos = db.query(Equipo).order_by(Equipo.orden.asc(), Equipo.id.asc()).all()
    if not equipos:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Crea al menos un equipo antes de repartir.")

    # Mismo candado que las altas: mientras se reparte a todos, un registro
    # nuevo espera (unos segundos) en vez de decidir con la foto vieja.
    with candado_equipos(db):
        settings_row = _get_or_create_settings(db)
        criterios = criterios_desde_settings(settings_row)
        # El staff no entra al reparto ni cuenta para los promedios de los equipos.
        participantes = db.query(Camper).filter(Camper.es_staff.is_(False)).all()

        asignaciones = repartir(participantes, equipos, criterios, incluir_fijados=payload.incluir_fijados)
        campers_por_id = {c.id: c for c in participantes}
        for camper_id, equipo_id in asignaciones.items():
            campers_por_id[camper_id].equipo_id = equipo_id
            if payload.incluir_fijados:
                # Un reparto que sí tocó a los fijados les quita esa marca — ya
                # no refleja una decisión manual vigente.
                campers_por_id[camper_id].equipo_fijado = False
        db.commit()

    return obtener_distribucion(db)
