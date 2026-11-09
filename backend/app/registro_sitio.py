"""Piezas del alta de gente en el campamento y del alta pública: búsqueda de
posibles duplicados por nombre y guardado con folio único.

Sin FastAPI-routing: las usan `routers/admin.py` (registro en sitio) y
`routers/public.py` (formulario público)."""

import re
import unicodedata
from collections.abc import Callable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Camper

# Palabras que no distinguen a una persona de otra al comparar nombres.
_PARTICULAS = {"de", "del", "la", "las", "los", "y"}


def _tokens(nombre: str) -> list[str]:
    s = unicodedata.normalize("NFD", nombre.casefold())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return [t for t in re.sub(r"[^a-z0-9]+", " ", s).split() if t not in _PARTICULAS]


def clave_nombre(nombre: str) -> str:
    """Dos nombres con la misma clave son la misma persona para efectos de
    duplicados (ignora mayúsculas, acentos, signos y orden)."""
    return " ".join(sorted(_tokens(nombre)))


def buscar_similares(db: Session, nombre: str, limite: int = 5, solo_exactos: bool = False) -> list[Camper]:
    """Registros cuyo nombre se parece a `nombre`. Exacto = misma clave (mismas
    palabras en cualquier orden). Si no es `solo_exactos`, también cuentan los
    que comparten al menos 2 palabras, o 1 cuando lo escrito es una sola palabra,
    para el aviso mientras se escribe. Se compara en Python: son unos cientos de
    filas y así no depende de cómo cada base maneja acentos."""
    buscado = _tokens(nombre)
    if not buscado:
        return []
    clave = " ".join(sorted(buscado))
    conjunto = set(buscado)
    minimo = 1 if len(conjunto) == 1 else 2

    exactos: list[Camper] = []
    parecidos: list[tuple[int, Camper]] = []
    for c in db.query(Camper).order_by(Camper.created_at.desc()).all():
        tokens_c = _tokens(c.nombre)
        if " ".join(sorted(tokens_c)) == clave:
            exactos.append(c)
        elif not solo_exactos:
            comunes = len(conjunto & set(tokens_c))
            if comunes >= minimo:
                parecidos.append((comunes, c))
    parecidos.sort(key=lambda p: -p[0])
    return (exactos + [c for _, c in parecidos])[:limite]


def guardar_con_folio_unico(
    db: Session,
    camper: Camper,
    intentos: int = 3,
    antes_de_commit: Callable[[Camper], None] | None = None,
) -> None:
    """Agrega y confirma `camper`. El folio son 6 hex aleatorios: si chocara con
    otro, se genera uno nuevo en vez de devolver un 500. `antes_de_commit`
    recibe al camper ya con `id` (tras el flush) para agregar a la misma
    transacción lo que dependa de él, como el historial."""
    from .models import _short_folio

    for n in range(intentos):
        db.add(camper)
        try:
            db.flush()
            if antes_de_commit:
                antes_de_commit(camper)
            db.commit()
            return
        except IntegrityError as exc:
            db.rollback()
            if "folio" not in str(exc.orig).lower() or n == intentos - 1:
                raise
            camper.folio = _short_folio()
