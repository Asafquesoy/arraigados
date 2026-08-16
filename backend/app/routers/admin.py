import csv
import io
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Camper, Sexo
from ..schemas import CamperListResponse, CamperOut, PagoUpdate
from ..security import get_current_admin

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
    admin_username: str = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    camper = db.get(Camper, camper_id)
    if not camper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro no encontrado")

    camper.pago_verificado = payload.verificado
    camper.verificado_en = datetime.now(timezone.utc) if payload.verificado else None
    camper.verificado_por = admin_username if payload.verificado else None
    db.commit()
    db.refresh(camper)
    return camper


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
