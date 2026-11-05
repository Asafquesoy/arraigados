"""Lee un comprobante: Gemini (plan gratis) primero, Tesseract local de respaldo.

`leer()` nunca lanza: ante cualquier fallo devuelve lo que pudo (o datos vacíos)
y el llamador marca `ocr_estado`. La cuota gratis de Gemini es por minuto y por
día, así que ante un 429 se avisa con `CuotaAgotada` solo a `leer_con_respaldo`
(que cae a local) — el procesamiento por lotes usa eso para dejar de insistir.
"""

import base64
import json
import logging
import re
import time
from datetime import date

import httpx

from .comprobante_ocr import TIPOS, DatosComprobante, extraer_texto_local, imagen_reducida_jpeg, parsear
from .config import settings

log = logging.getLogger("arraigados.comprobantes")

_URL = "https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"

_PROMPT = """Eres un lector de comprobantes de pago para un campamento cristiano en México.
La imagen puede ser: una captura de una transferencia bancaria (SPEI), un recibo de depósito,
una foto de un cupón/ticket de descuento o de "campamento gratis", u otra cosa.
Responde SOLO un JSON con estas llaves (usa null si no aparece o no estás seguro, nunca inventes):
{
 "tipo": "transferencia" | "deposito" | "ticket_descuento" | "campamento_gratis" | "otro",
 "banco": nombre del banco emisor o null,
 "referencia": referencia / folio / número de operación / número de serie del cupón, solo texto o dígitos, o null,
 "clave_rastreo": clave de rastreo SPEI o null,
 "folio_operacion": folio / número de operación / ID de movimiento ÚNICO de esta operación o null
   (no la "referencia numérica", que suele ser un valor fijo o la fecha),
 "fecha": fecha de la operación en formato AAAA-MM-DD o null,
 "monto": importe total en pesos como número (ej. 700.00) o null
}
Reglas: las fechas numéricas son DÍA/MES/AÑO (formato México): 04/10/2026 es el 4 de octubre. El monto es el importe transferido/depositado, no el saldo ni comisiones. Si la fecha tiene
mes escrito (Ago, Sep, Oct, Nov) conviértelo. Un cupón con número de serie va en "referencia"."""


# Los pagos de esta campaña caen en este rango; una fecha fuera de él casi siempre es un
# día/mes invertido (04/10 leído como 10 de abril) y se corrige si al invertirla sí cae dentro.
VENTANA_PAGOS = (date(2026, 7, 1), date(2026, 12, 31))


def _corregir_dia_mes(f: date | None) -> date | None:
    if f is None or VENTANA_PAGOS[0] <= f <= VENTANA_PAGOS[1] or f.day > 12:
        return f
    try:
        invertida = date(f.year, f.day, f.month)
    except ValueError:
        return f
    return invertida if VENTANA_PAGOS[0] <= invertida <= VENTANA_PAGOS[1] else f


class CuotaAgotada(Exception):
    pass


def _parsear_respuesta(texto: str) -> DatosComprobante:
    limpio = re.sub(r"^```(?:json)?|```$", "", texto.strip(), flags=re.M).strip()
    d = json.loads(limpio)
    fecha = None
    if d.get("fecha"):
        try:
            fecha = _corregir_dia_mes(date.fromisoformat(str(d["fecha"])[:10]))
        except ValueError:
            fecha = None
    monto = None
    if d.get("monto") is not None:
        try:
            monto = round(float(str(d["monto"]).replace(",", "").replace("$", "")) * 100)
        except ValueError:
            monto = None
    tipo = d.get("tipo") if d.get("tipo") in TIPOS else "otro"
    return DatosComprobante(
        tipo=tipo,
        banco=(d.get("banco") or None),
        referencia=(str(d["referencia"]).strip()[:80] if d.get("referencia") else None),
        # sin clave de rastreo, el folio de operación (único por operación) cumple su papel
        clave_rastreo=(
            str(d.get("clave_rastreo") or d.get("folio_operacion")).strip().upper()[:80]
            if (d.get("clave_rastreo") or d.get("folio_operacion"))
            else None
        ),
        fecha=fecha,
        monto_centavos=monto,
        texto=texto,
        fuente="gemini",
    )


def leer_gemini(content: bytes, mime: str) -> DatosComprobante:
    """Lanza CuotaAgotada en 429; cualquier otro fallo lanza Exception."""
    if mime == "application/pdf":
        parte = {"inline_data": {"mime_type": "application/pdf", "data": base64.b64encode(content).decode()}}
    else:
        jpeg = imagen_reducida_jpeg(content, mime)
        parte = {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(jpeg).decode()}}
    cuerpo = {
        "contents": [{"parts": [{"text": _PROMPT}, parte]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    # 500/503 ("alta demanda") son transitorios: se reintenta antes de rendirse a la lectura local.
    for intento in range(3):
        r = httpx.post(
            _URL.format(modelo=settings.gemini_model),
            headers={"x-goog-api-key": settings.gemini_api_key},
            json=cuerpo,
            timeout=60,
        )
        if r.status_code in (500, 503) and intento < 2:
            time.sleep(3 * (intento + 1))
            continue
        break
    if r.status_code == 429:
        raise CuotaAgotada()
    r.raise_for_status()
    texto = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return _parsear_respuesta(texto)


def leer_con_respaldo(content: bytes, mime: str, usar_gemini: bool = True) -> tuple[DatosComprobante, bool]:
    """(datos, gemini_disponible). El booleano pasa a False si Gemini se quedó
    sin cuota o la key no sirve, para que un lote no siga golpeándolo."""
    if usar_gemini and settings.gemini_api_key:
        try:
            return leer_gemini(content, mime), True
        except CuotaAgotada:
            log.warning("Gemini: cuota agotada, se usa lectura local")
            usar_gemini = False
        except Exception as exc:  # key inválida, red, JSON malformado…
            log.warning("Gemini falló (%s), se usa lectura local", exc.__class__.__name__)
    texto = extraer_texto_local(content, mime, settings.tesseract_cmd)
    return parsear(texto), usar_gemini


def leer(content: bytes, mime: str) -> DatosComprobante:
    return leer_con_respaldo(content, mime)[0]
