"""Historial de la conciliación. `registrar` solo agrega el evento a la sesión:
el commit lo hace el endpoint que lo llama, así evento y cambio van juntos."""

import json
from typing import Any

from sqlalchemy.orm import Session

from .models import Camper, ComprobanteEvento

SISTEMA = "sistema"  # usuario de las lecturas automáticas (IA / Tesseract)

# Campos del comprobante que se comparan para decir "qué cambió" al corregir a mano.
CAMPOS_COMPROBANTE = (
    "comp_tipo",
    "comp_banco",
    "comp_referencia",
    "comp_clave_rastreo",
    "comp_fecha",
    "comp_monto_centavos",
)


def registrar(db: Session, camper_id: int, accion: str, usuario: str, **detalle: Any) -> None:
    db.add(
        ComprobanteEvento(
            camper_id=camper_id,
            accion=accion,
            usuario=usuario,
            detalle=json.dumps(detalle, ensure_ascii=False, default=str) if detalle else None,
        )
    )


def foto_comprobante(c: Camper) -> dict[str, Any]:
    """Lo leído del comprobante en este momento (para los antes/después)."""
    return {campo: getattr(c, campo) for campo in CAMPOS_COMPROBANTE}
