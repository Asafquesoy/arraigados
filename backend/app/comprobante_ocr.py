"""Huellas de la imagen del comprobante, OCR local (Tesseract) y parser de texto.

Módulo sin FastAPI ni sesión de BD (misma forma que equipos_balance.py). Todo
lo que depende de binarios opcionales (Tesseract) falla en silencio devolviendo
vacío: el lector (comprobante_lector.py) decide qué hacer entonces.
"""

import hashlib
import io
import re
from dataclasses import dataclass
from datetime import date

TIPOS = ("transferencia", "deposito", "ticket_descuento", "campamento_gratis", "otro")

MESES = {
    "ene": 1, "enero": 1, "feb": 2, "febrero": 2, "mar": 3, "marzo": 3, "abr": 4, "abril": 4,
    "may": 5, "mayo": 5, "jun": 6, "junio": 6, "jul": 7, "julio": 7, "ago": 8, "agosto": 8,
    "sep": 9, "sept": 9, "septiembre": 9, "setiembre": 9, "oct": 10, "octubre": 10,
    "nov": 11, "noviembre": 11, "dic": 12, "diciembre": 12,
}


@dataclass
class DatosComprobante:
    tipo: str | None = None
    banco: str | None = None
    referencia: str | None = None
    clave_rastreo: str | None = None
    fecha: date | None = None
    monto_centavos: int | None = None
    texto: str = ""
    fuente: str = ""

    @property
    def completo(self) -> bool:
        return self.monto_centavos is not None and self.fecha is not None


# ---------------------------------------------------------------- huellas

def _imagen_para_huella(content: bytes, mime: str):
    from PIL import Image

    if mime == "application/pdf":
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(content)
        return pdf[0].render(scale=1.5).to_pil().convert("L")
    return Image.open(io.BytesIO(content)).convert("L")


def huellas(content: bytes, mime: str) -> tuple[str, str | None]:
    """(sha256 exacto, phash perceptual en hex). El phash detecta la misma
    captura recomprimida o reenviada por WhatsApp; es None si no se pudo abrir."""
    sha = hashlib.sha256(content).hexdigest()
    try:
        import imagehash

        return sha, str(imagehash.phash(_imagen_para_huella(content, mime)))
    except Exception:
        return sha, None


def distancia_phash(a: str | None, b: str | None) -> int:
    if not a or not b or len(a) != len(b):
        return 999
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def imagen_reducida_jpeg(content: bytes, mime: str, lado_max: int = 1600) -> bytes:
    """JPEG de hasta `lado_max` px — lo que se manda a la API (menos bytes/tokens)."""
    img = _imagen_para_huella(content, mime) if mime == "application/pdf" else None
    from PIL import Image, ImageOps

    if img is None:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(content)))
    img = img.convert("RGB")
    img.thumbnail((lado_max, lado_max))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    return out.getvalue()


# ---------------------------------------------------------------- OCR local

def extraer_texto_local(content: bytes, mime: str, tesseract_cmd: str = "") -> str:
    try:
        if mime == "application/pdf":
            import pypdfium2 as pdfium

            pdf = pdfium.PdfDocument(content)
            texto = pdf[0].get_textpage().get_text_range()
            if len(texto.strip()) > 30:
                return texto
        import pytesseract
        from PIL import Image, ImageOps

        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        img = _imagen_para_huella(content, mime) if mime == "application/pdf" else ImageOps.exif_transpose(
            Image.open(io.BytesIO(content))
        )
        img = ImageOps.autocontrast(img.convert("L"))
        if img.width < 1200:
            img = img.resize((img.width * 2, img.height * 2))
        try:
            return pytesseract.image_to_string(img, lang="spa")
        except pytesseract.TesseractError:
            return pytesseract.image_to_string(img)
    except Exception:
        return ""


# ---------------------------------------------------------------- parser

def _a_centavos(texto: str) -> int | None:
    limpio = texto.replace(",", "").replace(" ", "")
    try:
        return round(float(limpio) * 100)
    except ValueError:
        return None


MONTO_MINIMO_CENTAVOS = 10_000  # el campamento cuesta ≥ $350: menos de $100 es un error de lectura


def _monto(texto: str) -> int | None:
    # 1) la primera cifra con $ (en muchos comprobantes el importe va ANTES de su
    # etiqueta, y buscar "Monto" primero tomaba el día de la fecha); 2) cifra junto
    # a una etiqueta de importe, por si el OCR perdió el signo $.
    for m in re.finditer(r"\$\s*([\d]{1,3}(?:,\d{3})*(?:\.\d{2})?)", texto):
        v = _a_centavos(m.group(1))
        if v and v >= MONTO_MINIMO_CENTAVOS:
            return v
    etiquetada = re.search(
        r"(?:importe|monto|cantidad|total|enviaste|pagaste|transferiste)[^\d$]{0,25}\$?\s*([\d]{1,3}(?:[, ]?\d{3})*(?:\.\d{2})?)",
        texto,
        re.I,
    )
    if etiquetada:
        v = _a_centavos(etiquetada.group(1))
        if v and v >= MONTO_MINIMO_CENTAVOS:
            return v
    return None


def _fecha(texto: str) -> date | None:
    t = texto.lower()
    for m in re.finditer(r"(\d{1,2})\s*(?:/|-|de\s+|\s)\s*([a-záéíóú]{3,10})\.?\s*(?:/|-|de\s+|\s)?\s*(\d{4})", t):
        mes = MESES.get(m.group(2).strip("."))
        if mes:
            try:
                return date(int(m.group(3)), mes, int(m.group(1)))
            except ValueError:
                continue
    for m in re.finditer(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", t):
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            continue
    for m in re.finditer(r"(\d{4})-(\d{2})-(\d{2})", t):
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            continue
    return None


def _clave_rastreo(texto: str) -> str | None:
    # debe llevar al menos un dígito (descarta palabras como "CONCEPTO" cuando
    # la clave se parte en dos renglones); el hueco solo admite símbolos/espacios.
    m = re.search(r"clave\s+de\s+rastreo[^A-Z0-9]{0,40}((?=[A-Z0-9-]*\d)[A-Z0-9-]{8,40})", texto, re.I)
    return m.group(1).upper() if m else None


def _referencia(texto: str) -> str | None:
    m = re.search(
        r"(?:referencia(?:\s+num[eé]rica)?|ref\.?(?:\s*\w+)?|folio(?:\s+de\s+(?:la\s+)?operaci[oó]n)?|"
        r"n[oº°]\.?\s*de\s+operaci[oó]n)[^A-Z0-9]{0,40}(\d{4,20})",
        texto,
        re.I,
    )
    return m.group(1) if m else None


def parsear(texto: str) -> DatosComprobante:
    """Interpreta texto OCR de un comprobante mexicano (SPEI/depósito/cupón)."""
    bajo = texto.lower()
    clave = _clave_rastreo(texto)
    monto = _monto(texto)
    if "gratis" in bajo or "cupón" in bajo or "cupon" in bajo:
        tipo = "campamento_gratis"
    elif "descuento" in bajo:
        tipo = "ticket_descuento"
    elif clave or "transferencia" in bajo or "spei" in bajo or (monto and "comprobante" in bajo):
        tipo = "transferencia"
    elif monto:
        tipo = "deposito"
    else:
        tipo = "otro"
    return DatosComprobante(
        tipo=tipo,
        referencia=_referencia(texto),
        clave_rastreo=clave,
        fecha=_fecha(texto),
        monto_centavos=monto,
        texto=texto,
        fuente="local",
    )
