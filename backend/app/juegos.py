"""Catálogo de juegos del campamento y cuentas de sus calificaciones.

Módulo puro (sin FastAPI ni sesión de BD, igual que `equipos_balance.py`).

**Agregar un juego = agregar una entrada a `JUEGOS`**: el frontend dibuja el formulario de
captura y las tablas a partir de este catálogo, y la base de datos guarda solo los valores
crudos que puso el juez (`80`, `true`/`false`), nunca los puntos ya convertidos — así que si
cambia lo que vale un criterio, todo se recalcula solo y no hace falta migración.

Dos tipos de criterio:
- `escala`: el juez pone un número de 0 a `escala_max` (100) y se convierte proporcional
  (80 de 100 en un criterio de 200 puntos = 160).
- `si_no`: el juez solo marca sí/no; sí da todos los puntos del criterio y no da 0.

Un equipo puede tener varias hojas en un juego (una por juez): su puntaje es el **promedio**
de sus hojas, criterio por criterio.
"""

from dataclasses import dataclass, field
from typing import Literal

TipoCriterio = Literal["escala", "si_no"]


@dataclass(frozen=True)
class Criterio:
    clave: str
    nombre: str
    descripcion: str
    tipo: TipoCriterio
    puntos: int
    escala_max: int = 100


@dataclass(frozen=True)
class Juego:
    clave: str
    nombre: str
    descripcion: str
    criterios: tuple[Criterio, ...] = field(default_factory=tuple)

    @property
    def puntos_max(self) -> int:
        return sum(c.puntos for c in self.criterios)


JUEGOS: tuple[Juego, ...] = (
    Juego(
        clave="sketch",
        nombre="Sketch",
        descripcion="Cada equipo presenta un sketch de una historia bíblica.",
        criterios=(
            Criterio("historia", "Historia base", "Que la historia se entienda.", "escala", 200),
            Criterio("adaptacion", "Adaptación a tiempos actuales", "Qué tan bien llevan la historia a hoy.", "escala", 100),
            Criterio("inclusion", "Inclusión de todo el equipo", "¿Participaron todos los del equipo?", "si_no", 50),
            Criterio("tiempo", "Tiempo", "¿Duró mínimo 3 y máximo 5 minutos?", "si_no", 50),
            Criterio("originalidad", "Originalidad", "Qué tan original fue la presentación.", "escala", 200),
        ),
    ),
    # Reglas pendientes: se llenan con `criterios=(...)` cuando se definan.
    Juego(clave="busqueda_tesoro", nombre="Búsqueda del tesoro", descripcion=""),
    Juego(clave="rally_sucio", nombre="Rally sucio", descripcion=""),
    Juego(clave="voleibol_gigante", nombre="Voleibol gigante", descripcion=""),
)

_POR_CLAVE = {j.clave: j for j in JUEGOS}


def obtener_juego(clave: str) -> Juego | None:
    return _POR_CLAVE.get(clave)


def validar_valores(juego: Juego, valores: dict) -> dict:
    """Valida lo que capturó el juez y lo devuelve normalizado. Lanza `ValueError` con un
    mensaje listo para mostrar. Estricto: deben venir todos los criterios y ninguno de más."""
    if not juego.criterios:
        raise ValueError("Este juego todavía no tiene reglas de calificación.")
    claves = {c.clave for c in juego.criterios}
    extra = set(valores) - claves
    if extra:
        raise ValueError(f"Criterio desconocido: {', '.join(sorted(extra))}.")
    limpio: dict = {}
    for c in juego.criterios:
        if c.clave not in valores or valores[c.clave] is None:
            raise ValueError(f"Falta calificar «{c.nombre}».")
        v = valores[c.clave]
        if c.tipo == "si_no":
            if type(v) is not bool:
                raise ValueError(f"«{c.nombre}» debe ser sí o no.")
            limpio[c.clave] = v
        else:
            if type(v) is not int or not (0 <= v <= c.escala_max):
                raise ValueError(f"«{c.nombre}» debe ser un número entero de 0 a {c.escala_max}.")
            limpio[c.clave] = v
    return limpio


def puntos_hoja(juego: Juego, valores: dict) -> tuple[dict[str, float], float]:
    """Puntos que vale una hoja: `({criterio: puntos}, total)`. Tolerante: un criterio que
    falte (p. ej. se agregó al catálogo después de capturar la hoja) cuenta 0."""
    por_criterio: dict[str, float] = {}
    for c in juego.criterios:
        v = valores.get(c.clave)
        if c.tipo == "si_no":
            por_criterio[c.clave] = float(c.puntos) if v is True else 0.0
        else:
            por_criterio[c.clave] = (v / c.escala_max * c.puntos) if type(v) is int else 0.0
    return por_criterio, sum(por_criterio.values())


@dataclass
class ResultadoEquipo:
    equipo_id: int
    hojas: int
    por_criterio: dict[str, float]
    total: float
    posicion: int | None  # None = todavía sin hojas


def _posiciones(totales: list[float | None]) -> list[int | None]:
    """Posición de cada elemento por total descendente; los empates comparten posición
    (1, 1, 3…) y `None` (sin datos) no tiene posición."""
    con_datos = sorted((t for t in totales if t is not None), reverse=True)
    return [None if t is None else con_datos.index(t) + 1 for t in totales]


def resultados(
    juego: Juego, equipo_ids: list[int], hojas: list[tuple[int, dict]]
) -> list[ResultadoEquipo]:
    """Resultado de un juego por equipo, ordenado por posición (los que aún no tienen
    hojas van al final, en el orden en que llegaron en `equipo_ids`)."""
    por_equipo: dict[int, list[dict[str, float]]] = {}
    for equipo_id, valores in hojas:
        por_equipo.setdefault(equipo_id, []).append(puntos_hoja(juego, valores)[0])

    filas: list[ResultadoEquipo] = []
    for equipo_id in equipo_ids:
        lista = por_equipo.get(equipo_id, [])
        n = len(lista)
        promedio = {c.clave: (sum(h[c.clave] for h in lista) / n if n else 0.0) for c in juego.criterios}
        total = round(sum(promedio.values()), 1)
        filas.append(
            ResultadoEquipo(
                equipo_id=equipo_id,
                hojas=n,
                por_criterio={k: round(v, 1) for k, v in promedio.items()},
                total=total,
                posicion=None,
            )
        )

    for fila, pos in zip(filas, _posiciones([f.total if f.hojas else None for f in filas])):
        fila.posicion = pos
    return sorted(filas, key=lambda f: (f.posicion is None, f.posicion or 0))


@dataclass
class PosicionGeneral:
    equipo_id: int
    por_juego: dict[str, float | None]  # None = sin hojas en ese juego
    total: float
    posicion: int | None


def tabla_general(
    equipo_ids: list[int], resultados_por_juego: dict[str, list[ResultadoEquipo]]
) -> list[PosicionGeneral]:
    """Suma de los juegos por equipo. Un equipo sin hojas en ningún juego no tiene posición."""
    filas: list[PosicionGeneral] = []
    for equipo_id in equipo_ids:
        por_juego: dict[str, float | None] = {}
        for clave, res in resultados_por_juego.items():
            fila = next((r for r in res if r.equipo_id == equipo_id), None)
            por_juego[clave] = fila.total if fila and fila.hojas else None
        total = round(sum(v for v in por_juego.values() if v is not None), 1)
        filas.append(PosicionGeneral(equipo_id, por_juego, total, None))

    totales = [f.total if any(v is not None for v in f.por_juego.values()) else None for f in filas]
    for fila, pos in zip(filas, _posiciones(totales)):
        fila.posicion = pos
    return sorted(filas, key=lambda f: (f.posicion is None, f.posicion or 0))
