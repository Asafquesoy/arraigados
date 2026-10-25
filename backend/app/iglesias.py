"""Unificación de nombres de iglesia — la misma iglesia suele llegar escrita de
varias formas ("Iglesia Bautista Eliacim", "Eliacim", "ELIACIM"…), y
`equipos_balance` compara iglesias por texto, así que sin esto el reparto las
vería como distintas.

Dos piezas, ambas usadas por `POST /api/registros` y `PATCH
/api/admin/registros/{id}`:
- `clave_iglesia` / `elegir_nombre_oficial` (puras): si lo escrito es *igual*
  —después de ignorar mayúsculas, acentos, signos y palabras de relleno— a una
  iglesia ya registrada, se guarda con la grafía oficial. Nunca une por
  parecido: "Betania" y "Betsaida", o "Emanuel" y "Emanuel de Ciudad Madero",
  siguen siendo distintas.
- `iglesias_de_zona` / `canonicalizar_iglesia` (con sesión de DB): leen las
  iglesias ya registradas. Todo se busca dentro de la MISMA zona, porque un
  mismo nombre en otra ciudad es otra iglesia."""

import re
import unicodedata
from collections import Counter, defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Camper, Zona

# Palabras que no distinguen a una iglesia de otra ("Iglesia Bautista Betania"
# vs "Betania"). "ib" cubre "I.B." una vez quitados los puntos.
_RELLENO = {"iglesia", "iglesias", "bautista", "bautistas", "ib", "el", "la", "los", "las", "de", "del"}

# "PIB" siempre es "Primera Iglesia Bautista": con "iglesia"/"bautista" ya
# descartadas, "pib tampico" y "primera iglesia bautista de tampico" quedan
# con la misma clave.
_ALIAS = {"pib": "primera"}


def _limpiar(texto: str) -> str:
    s = unicodedata.normalize("NFD", texto.casefold())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.replace(".", "")  # "I.B." -> "ib", "PIB." -> "pib"
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def clave_iglesia(texto: str) -> str:
    """Clave de comparación: dos textos con la misma clave son la misma
    iglesia. Si el nombre era solo relleno ("Iglesia Bautista"), devuelve la
    versión limpia sin descartar nada, para no unir cosas distintas."""
    limpio = _limpiar(texto)
    palabras = [_ALIAS.get(p, p) for p in limpio.split() if p not in _RELLENO]
    return " ".join(palabras) if palabras else limpio


def _agrupar(existentes: list[tuple[str, int]]) -> dict[str, tuple[str, int]]:
    """{clave: (grafía más usada, total de personas)} — desempata por nombre
    para que el resultado sea reproducible."""
    grafias: dict[str, Counter] = defaultdict(Counter)
    for nombre, n in existentes:
        clave = clave_iglesia(nombre)
        if clave:
            grafias[clave][nombre] += n
    return {
        clave: (sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[0][0], sum(c.values()))
        for clave, c in grafias.items()
    }


def elegir_nombre_oficial(texto: str, existentes: list[tuple[str, int]]) -> str:
    """Devuelve la grafía oficial si `texto` es igual (tras limpiar) a una
    iglesia existente; si no, el mismo texto con los espacios colapsados."""
    texto_limpio = " ".join(texto.split())
    clave = clave_iglesia(texto_limpio)
    if not clave:
        return texto_limpio
    oficial = _agrupar(existentes).get(clave)
    return oficial[0] if oficial else texto_limpio


def _existentes_en_zona(db: Session, zona: Zona) -> list[tuple[str, int]]:
    filas = (
        db.query(Camper.iglesia, func.count(Camper.id))
        .filter(Camper.zona == zona)
        .group_by(Camper.iglesia)
        .all()
    )
    return [(nombre, n) for nombre, n in filas]


def iglesias_de_zona(db: Session, zona: Zona) -> list[str]:
    """Una entrada por iglesia (con su grafía más usada) en esa zona, las más
    grandes primero — lo que sugiere el autocompletado del formulario."""
    grupos = _agrupar(_existentes_en_zona(db, zona))
    return [nombre for nombre, _ in sorted(grupos.values(), key=lambda v: (-v[1], v[0]))]


def canonicalizar_iglesia(db: Session, texto: str, zona: Zona) -> str:
    return elegir_nombre_oficial(texto, _existentes_en_zona(db, zona))
