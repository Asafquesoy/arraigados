"""Deja el torneo de Voleibol gigante 2026 cerrado, tal como quedó en el campamento.

En el campamento solo se jugó la ronda 1 y la final Sauces–Cedros (ganó Sauces); la ronda 2 y el tercer lugar
no se jugaron. Para que el voleibol sume sus puntos al marcador general, este script escribe el torneo
completo: la ronda 1 real, los volados que hizo la app, la ronda 2 con marcadores de relleno, el tercer
lugar saltado y la final. Cada vez que se importa un respaldo del servidor (que reemplaza `calificaciones`)
hay que volver a correrlo.

Se corre desde `backend/`:
    .venv/bin/python -m app.voleibol_cierre_2026          # solo muestra qué haría
    .venv/bin/python -m app.voleibol_cierre_2026 --si     # aplica (con copia previa si es SQLite)

Los equipos se buscan por nombre. Si el resultado calculado por `voleibol.estado_torneo` no es exactamente
el esperado, no se guarda nada.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from . import voleibol
from .concurrencia import candado_equipos
from .models import Calificacion, Equipo

JUEGO = "voleibol_gigante"
USUARIO = "cierre-2026"

# (slot, equipo A, puntos A, equipo B, puntos B, cómo terminó)
R1 = [
    ("r1-1", "Robles", 4, "Cedros", 7, "normal"),
    ("r1-2", "Cipreses", 0, "Sauces", 7, "normal"),
    ("r1-3", "Ahuehuetes", 4, "Sequoias", 7, "normal"),
    ("r1-4", "Acacias", 7, "Olivos", 4, "normal"),
    ("r1-5", "Jacarandas", 7, "Palmas", 5, "normal"),
]
# Volados de la ronda 1 (los hizo la app): equipos empatados → orden en que quedaron. La fila se guarda
# a nombre del equipo con el id más bajo del grupo, igual que el endpoint.
VOLADOS_R1 = [
    ["Sequoias", "Acacias", "Cedros"],
    ["Robles", "Ahuehuetes", "Olivos"],
]
# Ronda 2: marcadores de relleno (no se jugó). Gana el mejor de la tabla de R1, salvo Cedros.
R2 = [
    ("r2-1", "Sauces", 7, "Sequoias", 6, "siguiente_punto"),
    ("r2-2", "Acacias", 5, "Cedros", 7, "normal"),
    ("r2-3", "Robles", 6, "Palmas", 7, "normal"),
    ("r2-4", "Jacarandas", 7, "Ahuehuetes", 5, "normal"),
    ("r2-5", "Olivos", 7, "Cipreses", 6, "siguiente_punto"),
]
TERCERO = ("tercero", "Jacarandas", "Sequoias")  # no se jugó: saltado
FINAL = ("final", "Sauces", 7, "Cedros", 5, "normal")

LUGARES_ESPERADOS = [
    "Sauces", "Cedros", "Jacarandas", "Sequoias", "Acacias",
    "Palmas", "Olivos", "Robles", "Ahuehuetes", "Cipreses",
]  # fmt: skip


class CierreError(Exception):
    pass


def _ids(db: Session) -> dict[str, int]:
    por_nombre = {e.nombre: e.id for e in db.query(Equipo).all()}
    faltan = sorted({n for n in LUGARES_ESPERADOS if n not in por_nombre})
    if faltan:
        raise CierreError(f"No existen estos equipos en la base: {', '.join(faltan)}.")
    return por_nombre


def _filas(ids: dict[str, int]) -> list[Calificacion]:
    filas: list[Calificacion] = []

    def partido(slot: str, a: str, pa: int | None, b: str, pb: int | None, termino: str | None, **extra: object) -> None:
        if pa is not None:
            voleibol.validar_marcador(pa, pb, termino)
        filas.append(
            Calificacion(
                juego=JUEGO,
                equipo_id=ids[a],
                juez=slot,
                valores={"b": ids[b], "pa": pa, "pb": pb, "termino": termino, **extra},
                creado_por=USUARIO,
            )
        )

    for fila in R1:
        partido(*fila)
    for orden in VOLADOS_R1:
        orden_ids = [ids[n] for n in orden]
        juez = "volado-r1-" + "-".join(str(i) for i in sorted(orden_ids))
        filas.append(
            Calificacion(
                juego=JUEGO,
                equipo_id=min(orden_ids),
                juez=juez,
                valores={"orden": orden_ids, "como": "app"},
                creado_por=USUARIO,
            )
        )
    for fila in R2:
        partido(*fila)
    slot, a, b = TERCERO
    partido(slot, a, None, b, None, None, saltado=True)
    partido(*FINAL)
    return filas


def _verificar(filas: list[Calificacion], ids: dict[str, int]) -> list[str]:
    """Recalcula el torneo con la lógica real. Devuelve las líneas de lugares o lanza CierreError."""
    partidos, desempates = voleibol.leer_filas([(f.equipo_id, f.juez, f.valores) for f in filas])
    estado = voleibol.estado_torneo(sorted(ids.values()), partidos, desempates)
    nombre = {v: k for k, v in ids.items()}
    if not estado.definitivo or not estado.lugares:
        raise CierreError(f"El torneo no queda terminado (fase {estado.fase}, empates {len(estado.empates)}).")
    if estado.avisos:
        raise CierreError("La app avisa: " + " / ".join(estado.avisos))
    if estado.partidos_rotos or estado.fuera:
        raise CierreError("Hay partidos o equipos fuera del torneo.")
    obtenido = [nombre[e] for e, _ in sorted(estado.lugares.items(), key=lambda kv: kv[1])]
    if obtenido != LUGARES_ESPERADOS or sorted(estado.lugares.values()) != list(range(1, 11)):
        raise CierreError(f"Los lugares no son los esperados: {obtenido}")
    puntos = estado.puntos or {}
    return [f"{estado.lugares[ids[n]]:>2}.º  {n:<11} {puntos[ids[n]]} pts" for n in LUGARES_ESPERADOS]


def _copia_previa(db: Session) -> Path | None:
    url = db.get_bind().url
    if url.get_backend_name() != "sqlite" or not url.database:
        return None
    origen = Path(url.database)
    destino = origen.parent / "data" / f"{origen.name}.antes-voleibol-{datetime.now():%Y%m%d_%H%M%S}"
    destino.parent.mkdir(exist_ok=True)
    shutil.copy2(origen, destino)
    return destino


def aplicar(db: Session, confirmar: bool) -> list[str]:
    ids = _ids(db)
    filas = _filas(ids)
    lineas = _verificar(filas, ids)
    if not confirmar:
        return lineas
    with candado_equipos(db):
        _copia_previa(db)
        db.query(Calificacion).filter(Calificacion.juego == JUEGO).delete(synchronize_session=False)
        db.add_all(filas)
        db.commit()
    return lineas


def _main(argv: list[str]) -> int:
    from .database import SessionLocal

    p = argparse.ArgumentParser(prog="python -m app.voleibol_cierre_2026", description=__doc__.split("\n")[0])
    p.add_argument("--si", action="store_true", help="aplicar (sin esto solo muestra el resultado)")
    args = p.parse_args(argv)
    db = SessionLocal()
    try:
        try:
            lineas = aplicar(db, args.si)
        except CierreError as err:
            db.rollback()
            print(f"No se guardó nada: {err}")
            return 1
        print("Resultado final del Voleibol gigante:")
        print("\n".join(lineas))
        print("Guardado." if args.si else "Es solo una vista previa: agrega --si para aplicarlo.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
