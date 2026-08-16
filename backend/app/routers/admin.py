import csv
import io
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AdminRole, AdminUser, AppSettings, Camper, Sexo, TallaCamisa
from ..schemas import (
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    AppSettingsOut,
    AppSettingsUpdate,
    CamperListResponse,
    CamperOut,
    PagoUpdate,
    TallaStatsItem,
    TallaStatsResponse,
)
from ..security import get_current_admin, hash_password, require_role

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


def _apply_filters(query, q: str | None, pago: bool | None, ciudad: str | None, sexo: Sexo | None):
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Camper.nombre.ilike(like), Camper.iglesia.ilike(like), Camper.folio.ilike(like)))
    if pago is not None:
        query = query.filter(Camper.pago_verificado == pago)
    if ciudad:
        query = query.filter(Camper.ciudad.ilike(f"%{ciudad}%"))
    if sexo:
        query = query.filter(Camper.sexo == sexo)
    return query


@router.get("/registros", response_model=CamperListResponse)
def listar_registros(
    q: str | None = None,
    pago: bool | None = None,
    ciudad: str | None = None,
    sexo: Sexo | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    base = _apply_filters(db.query(Camper), q, pago, ciudad, sexo)
    total = base.count()
    items = (
        base.order_by(Camper.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return CamperListResponse(items=items, total=total, page=page, page_size=page_size)


@router.patch("/registros/{camper_id}/pago", response_model=CamperOut)
def actualizar_pago(
    camper_id: int,
    payload: PagoUpdate,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN, AdminRole.VERIFICADOR_PAGO)),
    db: Session = Depends(get_db),
):
    camper = db.get(Camper, camper_id)
    if not camper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro no encontrado")

    camper.pago_verificado = payload.verificado
    camper.verificado_en = datetime.now(timezone.utc) if payload.verificado else None
    camper.verificado_por = admin.username if payload.verificado else None
    db.commit()
    db.refresh(camper)
    return camper


@router.delete("/registros/{camper_id}", status_code=status.HTTP_204_NO_CONTENT)
def borrar_registro(
    camper_id: int,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    camper = db.get(Camper, camper_id)
    if not camper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro no encontrado")

    ticket_path = os.path.join(settings.tickets_dir, camper.ticket_path)
    db.delete(camper)
    db.commit()

    try:
        os.remove(ticket_path)
    except OSError:
        # El registro ya se borró; un comprobante huérfano en disco no es motivo
        # para fallar la petición (puede que el archivo ya no exista, por ejemplo).
        pass


@router.get("/registros/{camper_id}/ticket")
def ver_ticket(camper_id: int, db: Session = Depends(get_db)):
    camper = db.get(Camper, camper_id)
    if not camper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro no encontrado")

    path = os.path.join(settings.tickets_dir, camper.ticket_path)
    if not os.path.isfile(path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comprobante no encontrado")

    return FileResponse(path, media_type=camper.ticket_mime)


@router.get("/registros.csv")
def exportar_csv(
    q: str | None = None,
    pago: bool | None = None,
    ciudad: str | None = None,
    sexo: Sexo | None = None,
    db: Session = Depends(get_db),
):
    base = _apply_filters(db.query(Camper), q, pago, ciudad, sexo)
    rows = base.order_by(Camper.created_at.desc()).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["Folio", "Nombre", "Ciudad", "Iglesia", "Edad", "Sexo", "Talla", "Pago verificado", "Verificado por", "Fecha registro"]
    )
    for c in rows:
        writer.writerow(
            [
                c.folio,
                c.nombre,
                c.ciudad,
                c.iglesia,
                c.edad,
                c.sexo.value,
                c.talla_camisa.value if c.talla_camisa else "",
                "Sí" if c.pago_verificado else "No",
                c.verificado_por or "",
                c.created_at.strftime("%Y-%m-%d %H:%M"),
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=registros_arraigados.csv"},
    )


@router.get("/stats/tallas", response_model=TallaStatsResponse)
def estadisticas_tallas(db: Session = Depends(get_db)):
    """Conteo de playeras por talla sobre TODOS los registros (no solo la
    página/filtro actual) — responde aunque el formulario público ya no pida
    talla, son datos ya capturados."""
    rows = (
        db.query(
            Camper.talla_camisa,
            func.count(Camper.id),
            func.sum(case((Camper.pago_verificado.is_(True), 1), else_=0)),
        )
        .group_by(Camper.talla_camisa)
        .all()
    )

    por_talla = {talla: (total, verificados or 0) for talla, total, verificados in rows if talla is not None}
    sin_talla = next((total for talla, total, _ in rows if talla is None), 0)

    items = [
        TallaStatsItem(talla=talla, total=por_talla[talla][0], verificados=por_talla[talla][1])
        for talla in TallaCamisa
        if talla in por_talla
    ]
    total_campers = sum(total for _, total, _ in rows)

    return TallaStatsResponse(items=items, sin_talla=sin_talla, total_campers=total_campers)


@router.patch("/settings", response_model=AppSettingsOut)
def actualizar_settings(
    payload: AppSettingsUpdate,
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    updates = payload.model_dump(exclude_unset=True)
    row = db.get(AppSettings, 1)
    if not row:
        # No debería pasar (seed_settings() la crea al arrancar), pero si la fila
        # sembrada faltara por alguna razón, se crea aquí en vez de fallar.
        row = AppSettings(id=1)
        db.add(row)
    for field, value in updates.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return AppSettingsOut(show_shirt_size=row.show_shirt_size, precio_mxn=row.precio_mxn)


# ---- Gestión de cuentas de admin (todas exigen rol Admin) ----

usuarios_router = APIRouter(
    prefix="/api/admin/usuarios",
    tags=["admin-usuarios"],
    dependencies=[Depends(require_role(AdminRole.ADMIN))],
)


@usuarios_router.get("", response_model=list[AdminUserOut])
def listar_usuarios(db: Session = Depends(get_db)):
    return db.query(AdminUser).order_by(AdminUser.created_at.asc()).all()


@usuarios_router.post("", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(payload: AdminUserCreate, db: Session = Depends(get_db)):
    if db.query(AdminUser).filter(AdminUser.username == payload.username).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ese nombre de usuario ya existe.")

    admin = AdminUser(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


@usuarios_router.patch("/{admin_id}", response_model=AdminUserOut)
def actualizar_usuario(
    admin_id: int,
    payload: AdminUserUpdate,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    target = db.get(AdminUser, admin_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")

    if payload.role is not None:
        if target.id == admin.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes cambiar tu propio rol.")
        target.role = payload.role

    if payload.password:
        target.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(target)
    return target


@usuarios_router.delete("/{admin_id}", status_code=status.HTTP_204_NO_CONTENT)
def borrar_usuario(
    admin_id: int,
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    db: Session = Depends(get_db),
):
    target = db.get(AdminUser, admin_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")

    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes borrar tu propia cuenta.")

    if target.role == AdminRole.ADMIN:
        admins_restantes = db.query(AdminUser).filter(AdminUser.role == AdminRole.ADMIN).count()
        if admins_restantes <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "Debe existir al menos un administrador.")

    db.delete(target)
    db.commit()
