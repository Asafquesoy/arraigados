"""Procesa comprobantes: huellas + lectura de monto/fecha/referencia.

Se usa desde tres lados: al registrarse alguien (`procesar_uno`, en segundo
plano), desde el botón del panel (`procesar_lote`, segundo plano) y como script
(`python -m app.procesar_comprobantes [--todos]`, p. ej. tras el deploy).
"""

import argparse
import logging
import os
import time

from sqlalchemy.orm import Session

from .comprobante_lector import leer_con_respaldo
from .comprobante_ocr import TIPOS, huellas
from .config import settings
from .database import SessionLocal
from .models import Camper

log = logging.getLogger("arraigados.comprobantes")

# El plan gratis de Gemini permite ~15 peticiones/min en Flash-Lite: una cada 4.5 s.
PAUSA_GEMINI_S = 4.5

# Avance del lote en curso (un solo proceso/Droplet, igual que ratelimit.py).
estado_lote: dict = {"corriendo": False, "total": 0, "hechos": 0, "con_gemini": True, "error": None}


def procesar_uno(db: Session, camper: Camper, usar_gemini: bool = True) -> bool:
    """Calcula huellas y lee el comprobante de `camper`. Devuelve si Gemini
    sigue disponible. No pisa datos corregidos a mano (`comp_editado`)."""
    if not camper.ticket_path:
        return usar_gemini
    ruta = os.path.join(settings.tickets_dir, camper.ticket_path)
    try:
        with open(ruta, "rb") as f:
            content = f.read()
    except OSError:
        camper.ocr_estado = "ERROR"
        db.commit()
        return usar_gemini

    mime = camper.ticket_mime or "image/jpeg"
    camper.ticket_sha256, camper.ticket_phash = huellas(content, mime)

    if camper.comp_editado:
        db.commit()
        return usar_gemini

    datos, usar_gemini = leer_con_respaldo(content, mime, usar_gemini)
    camper.ocr_fuente = datos.fuente
    camper.ocr_texto = (datos.texto or "")[:4000]
    camper.comp_tipo = datos.tipo if datos.tipo in TIPOS else None
    camper.comp_banco = datos.banco
    camper.comp_referencia = datos.referencia
    camper.comp_clave_rastreo = datos.clave_rastreo
    camper.comp_fecha = datos.fecha
    camper.comp_monto_centavos = datos.monto_centavos
    hay_algo = any([datos.monto_centavos, datos.fecha, datos.referencia, datos.clave_rastreo])
    if datos.completo or (datos.tipo in ("campamento_gratis", "ticket_descuento") and datos.referencia):
        camper.ocr_estado = "LEIDO"
    elif hay_algo:
        camper.ocr_estado = "INCOMPLETO"
    else:
        camper.ocr_estado = "ERROR"
    db.commit()
    return usar_gemini


def procesar_registro_nuevo(camper_id: int) -> None:
    """Para BackgroundTasks tras crear un registro: nunca debe propagar errores."""
    db = SessionLocal()
    try:
        camper = db.get(Camper, camper_id)
        if camper:
            procesar_uno(db, camper)
    except Exception:
        log.exception("No se pudo leer el comprobante del registro %s", camper_id)
    finally:
        db.close()


def procesar_lote(todos: bool = False) -> None:
    """Procesa en serie los pendientes (o todos). Actualiza `estado_lote`."""
    if estado_lote["corriendo"]:
        return
    db = SessionLocal()
    try:
        q = db.query(Camper).filter(Camper.ticket_path.is_not(None))
        if not todos:
            q = q.filter(Camper.ocr_estado.in_(("PENDIENTE", "ERROR")))
        ids = [c.id for c in q.order_by(Camper.id)]
        estado_lote.update(corriendo=True, total=len(ids), hechos=0, con_gemini=bool(settings.gemini_api_key), error=None)
        usar_gemini = bool(settings.gemini_api_key)
        for cid in ids:
            camper = db.get(Camper, cid)
            if camper is None:
                continue
            try:
                antes = usar_gemini
                usar_gemini = procesar_uno(db, camper, usar_gemini)
                if antes and usar_gemini:
                    time.sleep(PAUSA_GEMINI_S)
            except Exception:
                db.rollback()
                log.exception("Falló el registro %s", cid)
            estado_lote["hechos"] += 1
            estado_lote["con_gemini"] = usar_gemini
    except Exception as exc:
        estado_lote["error"] = exc.__class__.__name__
        log.exception("Falló el procesamiento por lotes")
    finally:
        estado_lote["corriendo"] = False
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lee los comprobantes pendientes")
    parser.add_argument("--todos", action="store_true", help="relee también los ya leídos")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    procesar_lote(todos=args.todos)
    print(estado_lote)
