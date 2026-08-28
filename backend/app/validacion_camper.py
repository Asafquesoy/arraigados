"""Reglas de validación y normalización de los datos de un campero — compartidas
entre `POST /api/registros` (routers/public.py::crear_registro) y
`PATCH /api/admin/registros/{id}` (routers/admin.py::actualizar_registro), para
que crear y editar un registro nunca puedan divergir en qué es un dato válido.

Módulo puro (sin FastAPI-routing ni sesión de DB), igual criterio que
equipos_balance.py."""

from datetime import date

from fastapi import HTTPException, status

from .models import TallaCamisa, TipoParticipante


def validar_datos_camper(
    *,
    tipo: TipoParticipante,
    telefono: str | None,
    bautizado: bool | None,
    bautismo_mes: int | None,
    bautismo_anio: int | None,
    tiene_promocion: bool,
    promocion_detalle: str | None,
    talla_camisa: TallaCamisa | None,
    talla_otra: str | None,
) -> None:
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


def normalizar_datos_camper(
    *,
    nombre: str,
    iglesia: str,
    edad: int,
    sexo,
    zona,
    tipo: TipoParticipante,
    telefono: str | None,
    bautizado: bool | None,
    bautismo_mes: int | None,
    bautismo_anio: int | None,
    fecha_pago,
    tiene_promocion: bool,
    promocion_detalle: str | None,
    talla_camisa: TallaCamisa | None,
    talla_otra: str | None,
) -> dict:
    """Aplica la misma lógica de "anular lo que no aplica" que usaba
    crear_registro al construir el Camper — un dato dependiente (teléfono de
    consejero, fecha de bautismo, detalle de promoción, talla libre) nunca
    queda guardado si su condición ya no se cumple."""
    return {
        "nombre": nombre.strip(),
        "iglesia": iglesia.strip(),
        "edad": edad,
        "sexo": sexo,
        "zona": zona,
        "tipo": tipo,
        "telefono": telefono.strip() if tipo == TipoParticipante.CONSEJERO and telefono else None,
        "bautizado": bautizado if tipo == TipoParticipante.CAMPERO else None,
        "bautismo_mes": bautismo_mes if tipo == TipoParticipante.CAMPERO and bautizado else None,
        "bautismo_anio": bautismo_anio if tipo == TipoParticipante.CAMPERO and bautizado else None,
        "fecha_pago": fecha_pago,
        "tiene_promocion": tiene_promocion,
        "promocion_detalle": promocion_detalle.strip() if tiene_promocion and promocion_detalle else None,
        "talla_camisa": talla_camisa,
        "talla_otra": talla_otra.strip() if talla_camisa == TallaCamisa.OTRA and talla_otra else None,
    }
