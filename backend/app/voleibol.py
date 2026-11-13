"""Torneo de Voleibol gigante: sorteo, tabla, rondas y lugar final.

Módulo puro (sin FastAPI ni sesión de BD, igual que `equipos_balance.py` y `juegos.py`). Las reglas
están en `reglas-juegos/Formato del torneo - Voleibol gigante 2026.md` y
`reglas-juegos/Concentrado de puntos - Voleibol gigante 2026.md`; aquí se implementan tal cual,
incluidos los supuestos marcados con ⚠ en esos documentos.

**Cómo se guarda** (sin migración, reusa la tabla `calificaciones`, igual que las estaciones):
- Un partido = una fila con `juez` = *slot* (`r1-1`…, `r2-1`…, `tercero`, `final`), `equipo_id` = el
  equipo A y `valores = {"b": id_B, "pa": int|None, "pb": int|None, "termino": str|None,
  "saltado": bool}`. Lo que se guarda es el marcador que anotó el líder de tabla, nunca puntos.
- Un desempate (volado / punto de oro) = una fila con `juez = "volado-<ronda>-<ids>"`, `equipo_id` = el
  menor id del grupo y `valores = {"orden": [ids], "como": "app"|"cancha"}`. Solo vale si el grupo
  que hoy está empatado es *exactamente* ese conjunto: si corrigen un marcador y el empate cambia, el
  desempate viejo se ignora y se vuelve a pedir.

**Flujo**: sorteo (ronda 1) → tabla → ronda 2 por la tabla sin revanchas → gran final (1.º–2.º) y
tercer lugar (3.º–4.º, se puede saltar). Los puntos del marcador general dependen solo del lugar final.
"""

import random
import re
from dataclasses import dataclass, field
from typing import Literal

PUNTOS_LUGAR: tuple[int, ...] = (500, 460, 430, 400, 380, 360, 340, 320, 300, 280)
META = 7  # un set a 7 puntos (con tope de 4 min)
META_CORTA = 5  # el recorte del horario: partidos a 5 puntos
TERMINOS = ("normal", "tope", "siguiente_punto", "volado")
MIN_EQUIPOS = 4

_RE_SLOT = re.compile(r"^(r1|r2)-(\d+)$")
_RE_VOLADO = re.compile(r"^volado-(r1|r2)-")


def puntos_de_lugar(lugar: int) -> int:
    """Puntos al marcador general por el lugar final (del 10.º en adelante, lo mismo que el 10.º)."""
    return PUNTOS_LUGAR[min(max(lugar, 1), len(PUNTOS_LUGAR)) - 1]


def es_slot(slot: str) -> bool:
    return bool(_RE_SLOT.match(slot)) or slot in ("tercero", "final")


def ronda_de(slot: str) -> str:
    """`r1`, `r2`, `tercero` o `final`."""
    return slot.split("-")[0]


def numero_de(slot: str) -> int:
    m = _RE_SLOT.match(slot)
    return int(m.group(2)) if m else 0


def etiqueta_slot(slot: str) -> str:
    if slot == "final":
        return "Gran final"
    if slot == "tercero":
        return "Tercer lugar"
    return f"Ronda {ronda_de(slot)[1]} · Partido {numero_de(slot)}"


# ==========================================================================================
# Partidos y marcadores
# ==========================================================================================


@dataclass
class Partido:
    slot: str
    a: int
    b: int
    pa: int | None = None
    pb: int | None = None
    termino: str | None = None
    saltado: bool = False  # solo el tercer lugar se puede saltar

    @property
    def ronda(self) -> str:
        return ronda_de(self.slot)

    @property
    def jugado(self) -> bool:
        return self.pa is not None and self.pb is not None and self.pa != self.pb and not self.saltado

    @property
    def ganador(self) -> int | None:
        if not self.jugado:
            return None
        return self.a if self.pa > self.pb else self.b  # type: ignore[operator]

    @property
    def perdedor(self) -> int | None:
        g = self.ganador
        if g is None:
            return None
        return self.b if g == self.a else self.a


def validar_marcador(pa: object, pb: object, termino: object) -> tuple[int, int, str]:
    """Valida el marcador que anotó el líder de tabla. Lanza `ValueError` con un mensaje listo para mostrar."""
    if termino not in TERMINOS:
        raise ValueError("Elige cómo terminó el partido: normal, por tope, con el siguiente punto o por volado.")
    for p in (pa, pb):
        if type(p) is not int or not (0 <= p <= META):
            raise ValueError(f"Los puntos son números enteros de 0 a {META}.")
    assert type(pa) is int and type(pb) is int
    if pa == pb:
        raise ValueError(
            "Un partido no puede terminar empatado: si se acabó el tiempo y van empatados, "
            "el siguiente punto decide (anótalo con «Con el siguiente punto»)."
        )
    gana, pierde = max(pa, pb), min(pa, pb)
    if termino == "volado":
        if (gana, pierde) != (META, 0):
            raise ValueError(f"Si el partido no se jugó, se anota {META} – 0 para quien ganó el volado.")
    elif termino == "normal":
        if gana not in (META, META_CORTA):
            raise ValueError(
                f"En un partido normal alguien llega a {META} puntos (o a {META_CORTA} si se recortó el partido). "
                "Si se acabó el tiempo, elige «Por tope»."
            )
    elif termino == "siguiente_punto":
        if gana - pierde != 1:
            raise ValueError("Con el siguiente punto el ganador queda a 1 punto de diferencia (por ejemplo 7 – 6).")
    return pa, pb, termino  # type: ignore[return-value]


# ==========================================================================================
# Sorteo
# ==========================================================================================


def sorteo(equipo_ids: list[int], rng: random.Random | None = None) -> list[tuple[int, int]]:
    """Ronda 1: los equipos se sacan de dos en dos; el orden de los pares es el orden de juego."""
    if len(equipo_ids) < MIN_EQUIPOS or len(equipo_ids) % 2:
        raise ValueError(f"El torneo necesita un número par de equipos (mínimo {MIN_EQUIPOS}). Ahora hay {len(equipo_ids)}.")
    mezcla = list(equipo_ids)
    (rng or random.SystemRandom()).shuffle(mezcla)
    return [(mezcla[i], mezcla[i + 1]) for i in range(0, len(mezcla), 2)]


# ==========================================================================================
# Tabla
# ==========================================================================================


@dataclass
class FilaTabla:
    equipo_id: int
    jugados: int = 0
    victorias: int = 0
    f: int = 0  # puntos a favor
    c: int = 0  # puntos en contra
    lugar: int = 0  # los empates sin resolver comparten lugar (4, 4, 6…)
    empate: bool = False  # sigue empatado: falta el volado
    por_volado: bool = False  # el orden lo decidió un desempate

    @property
    def dif(self) -> int:
        return self.f - self.c


def _clave_tabla(fila: FilaTabla) -> tuple[int, int, int]:
    # Más victorias → mejor diferencia → más puntos a favor.
    return (-fila.victorias, -fila.dif, -fila.f)


def calcular_tabla(
    equipo_ids: list[int],
    partidos: list[Partido],
    desempates: dict[frozenset[int], list[int]],
    marcar_empates: bool = True,
) -> list[FilaTabla]:
    """Tabla ordenada con los partidos jugados. Un grupo empatado en los tres criterios se ordena con el
    desempate guardado si hay uno para *ese* conjunto; si no, comparte lugar (y queda marcado `empate`
    cuando `marcar_empates`: solo tiene sentido pedir volado con la ronda completa)."""
    filas = {i: FilaTabla(i) for i in equipo_ids}
    for p in partidos:
        if not p.jugado or p.a not in filas or p.b not in filas:
            continue
        fa, fb = filas[p.a], filas[p.b]
        fa.jugados += 1
        fb.jugados += 1
        fa.f += p.pa  # type: ignore[operator]
        fa.c += p.pb  # type: ignore[operator]
        fb.f += p.pb  # type: ignore[operator]
        fb.c += p.pa  # type: ignore[operator]
        filas[p.ganador].victorias += 1  # type: ignore[index]

    ordenadas = sorted(filas.values(), key=lambda f: (_clave_tabla(f), f.equipo_id))
    resultado: list[FilaTabla] = []
    i = 0
    while i < len(ordenadas):
        j = i
        while j + 1 < len(ordenadas) and _clave_tabla(ordenadas[j + 1]) == _clave_tabla(ordenadas[i]):
            j += 1
        grupo = ordenadas[i : j + 1]
        if len(grupo) == 1:
            grupo[0].lugar = i + 1
        else:
            orden = desempates.get(frozenset(f.equipo_id for f in grupo))
            if orden is not None and sorted(orden) == sorted(f.equipo_id for f in grupo):
                por_id = {f.equipo_id: f for f in grupo}
                grupo = [por_id[x] for x in orden]
                for n, f in enumerate(grupo):
                    f.lugar = i + 1 + n
                    f.por_volado = True
            else:
                for f in grupo:
                    f.lugar = i + 1
                    f.empate = marcar_empates
        resultado.extend(grupo)
        i = j + 1
    return resultado


@dataclass
class Empate:
    ronda: Literal["r1", "r2"]
    equipos: list[int]
    primero: int  # primer lugar que ocupan en la tabla
    ultimo: int  # último lugar que ocupan
    tipo: Literal["volado", "punto_oro"]
    bloquea: bool  # si impide armar la siguiente ronda


def _cubeta(lugar: int, tercero_juega: bool) -> int | str:
    """Lugares que valen lo mismo o que se deciden en otro partido: un empate dentro de una misma
    cubeta no cambia nada (p. ej. 1.º y 2.º de la tabla juegan la final entre sí)."""
    if lugar <= 2:
        return "final"
    if lugar <= 4 and tercero_juega:
        return "tercero"
    if lugar >= len(PUNTOS_LUGAR):
        return "ultimos"
    return lugar


def empates_pendientes(tabla: list[FilaTabla], ronda: Literal["r1", "r2"], tercero_juega: bool = True) -> list[Empate]:
    """Empates exactos sin resolver que **importan**. Tras la ronda 1 todos importan (deciden las parejas
    de la ronda 2). Tras la ronda 2 solo los que cambian un lugar final o quién juega la final / el
    tercer lugar. Si decide quién va a la final o al tercer lugar y son dos equipos, es punto de oro."""
    grupos: dict[int, list[FilaTabla]] = {}
    for f in tabla:
        if f.empate:
            grupos.setdefault(f.lugar, []).append(f)
    salida: list[Empate] = []
    for lugar, grupo in sorted(grupos.items()):
        primero, ultimo = lugar, lugar + len(grupo) - 1
        if ronda == "r2":
            cubetas = {_cubeta(x, tercero_juega) for x in range(primero, ultimo + 1)}
            if len(cubetas) == 1 and isinstance(next(iter(cubetas)), str):
                continue  # no cambia nada
        decide_partido = ronda == "r2" and len(grupo) == 2 and ((primero, ultimo) == (2, 3) or ((primero, ultimo) == (4, 5) and tercero_juega))
        salida.append(
            Empate(
                ronda=ronda,
                equipos=sorted(f.equipo_id for f in grupo),
                primero=primero,
                ultimo=ultimo,
                tipo="punto_oro" if decide_partido else "volado",
                bloquea=True if ronda == "r1" else primero <= 4,
            )
        )
    return salida


# ==========================================================================================
# Ronda 2 (por la tabla, sin revanchas) y finales
# ==========================================================================================


def _pares(orden: list[int]) -> list[tuple[int, int]]:
    return [(orden[i], orden[i + 1]) for i in range(0, len(orden), 2)]


def _emparejar_cercano(orden: list[int], ya_jugaron: set[frozenset[int]]) -> list[tuple[int, int]] | None:
    """Plan B cuando el cambio simple no resuelve las revanchas: el emparejamiento sin revanchas que
    menos se aleja de la tabla (suma de distancias entre los lugares de cada pareja)."""
    mejor: list = [None, 10**9]
    nodos = [0]

    def buscar(libres: list[int], pares: list[tuple[int, int]], costo: int) -> None:
        nodos[0] += 1
        if nodos[0] > 200_000 or costo >= mejor[1]:
            return
        if not libres:
            mejor[0], mejor[1] = list(pares), costo
            return
        i = libres[0]
        for j in libres[1:]:
            if frozenset((orden[i], orden[j])) in ya_jugaron:
                continue
            buscar([k for k in libres if k != i and k != j], pares + [(orden[i], orden[j])], costo + (j - i))

    buscar(list(range(len(orden))), [], 0)
    return mejor[0]


@dataclass
class ParejasRonda2:
    pares: list[tuple[int, int]]
    # (a, b que ya jugaron entre sí, el que se cambia, con quién se cambia) — en el orden en que se hicieron
    cambios: list[tuple[int, int, int, int]] = field(default_factory=list)
    ajustada: bool = False  # hubo que buscar otro emparejamiento (los cambios simples no alcanzaron)
    con_revancha: bool = False  # no había forma de evitar que se repita un partido


def parejas_ronda2(orden: list[int], ya_jugaron: set[frozenset[int]]) -> ParejasRonda2:
    """1.º con 2.º, 3.º con 4.º… Si a una pareja le toca alguien con quien ya jugó, **el de arriba se cambia
    con el primero de la pareja de abajo** (si es la última pareja, con el primero de la pareja de arriba);
    después se vuelve a revisar todo, porque el cambio puede crear otra revancha."""
    pos = list(orden)
    n_pares = len(pos) // 2
    cambios: list[tuple[int, int, int, int]] = []
    vistos = {tuple(pos)}
    if n_pares >= 2:
        for _ in range(200):
            k = next((k for k in range(n_pares) if frozenset((pos[2 * k], pos[2 * k + 1])) in ya_jugaron), None)
            if k is None:
                return ParejasRonda2(_pares(pos), cambios)
            i = 2 * k
            j = i + 2 if k < n_pares - 1 else i - 2
            cambios.append((pos[i], pos[i + 1], pos[i], pos[j]))
            pos[i], pos[j] = pos[j], pos[i]
            if tuple(pos) in vistos:
                break
            vistos.add(tuple(pos))
    elif all(frozenset(p) not in ya_jugaron for p in _pares(pos)):
        return ParejasRonda2(_pares(pos))

    alternativa = _emparejar_cercano(list(orden), ya_jugaron)
    if alternativa is not None:
        return ParejasRonda2(alternativa, [], ajustada=True)
    return ParejasRonda2(_pares(list(orden)), [], con_revancha=True)


# ==========================================================================================
# Lectura de filas y estado del torneo
# ==========================================================================================


def leer_filas(
    filas: list[tuple[int, str, dict]],
) -> tuple[list[Partido], dict[tuple[str, frozenset[int]], list[int]]]:
    """De filas `(equipo_id, juez, valores)` de `calificaciones` a partidos y desempates. Tolerante: lo que
    no se entiende se ignora."""
    partidos: list[Partido] = []
    desempates: dict[tuple[str, frozenset[int]], list[int]] = {}
    for equipo_id, juez, v in filas:
        if not isinstance(v, dict):
            continue
        if es_slot(juez):
            b = v.get("b")
            if type(b) is not int:
                continue
            pa, pb = v.get("pa"), v.get("pb")
            if type(pa) is not int or type(pb) is not int:
                pa = pb = None
            termino = v.get("termino")
            partidos.append(
                Partido(juez, equipo_id, b, pa, pb, termino if isinstance(termino, str) else None, v.get("saltado") is True)
            )
        else:
            m = _RE_VOLADO.match(juez)
            orden = v.get("orden")
            if m and isinstance(orden, list) and orden and all(type(x) is int for x in orden):
                desempates[(m.group(1), frozenset(orden))] = list(orden)
    return partidos, desempates


@dataclass
class Siguiente:
    accion: Literal["sortear", "capturar", "desempatar", "armar_ronda2", "armar_finales", "terminado", "sin_equipos"]
    faltan: int = 0
    en_cancha: str | None = None  # slot del partido que toca jugar
    proximo: str | None = None  # slot del que sigue (para que ya estén listos al borde)


@dataclass
class Propuesta:
    tipo: Literal["ronda2", "finales"]
    partidos: list[tuple[str, int, int]]  # (slot, equipo A, equipo B)
    cambios: list[tuple[int, int, int, int]] = field(default_factory=list)
    ajustada: bool = False
    con_revancha: bool = False


@dataclass
class Estado:
    fase: Literal["sin_sorteo", "ronda1", "ronda2", "finales", "terminado"]
    participantes: list[int]
    fuera: list[int]  # equipos creados después del sorteo: no están en el torneo
    partidos_rotos: int  # partidos que mencionan un equipo que ya no existe (se ignoran)
    r1: list[Partido]
    r2: list[Partido]
    tercero: Partido | None
    final: Partido | None
    tabla_r1: list[FilaTabla] | None
    tabla_r2: list[FilaTabla] | None
    empates: list[Empate]
    siguiente: Siguiente
    propuesta: Propuesta | None
    lugares: dict[int, int] | None  # provisional hasta que `definitivo`
    origen_lugar: dict[int, str]  # "final" | "tercero" | "tabla"
    definitivo: bool
    tercero_saltado: bool
    avisos: list[str]

    @property
    def partidos(self) -> list[Partido]:
        """En el orden en que se juegan (el tercer lugar antes de la final)."""
        return [*self.r1, *self.r2, *([self.tercero] if self.tercero else []), *([self.final] if self.final else [])]

    @property
    def puntos(self) -> dict[int, int] | None:
        """Puntos al marcador general: solo cuando el torneo terminó y todo está resuelto."""
        if not self.definitivo or not self.lugares:
            return None
        return {e: puntos_de_lugar(l) for e, l in self.lugares.items()}


def _completa(partidos: list[Partido]) -> bool:
    return bool(partidos) and all(p.jugado for p in partidos)


def _conjuntos(pares: list[tuple[int, int]]) -> set[frozenset[int]]:
    return {frozenset(p) for p in pares}


def _calcular_lugares(
    tabla_r2: list[FilaTabla], final: Partido | None, tercero: Partido | None
) -> tuple[dict[int, int], dict[int, str]]:
    """1.º–2.º de la final, 3.º–4.º del tercer lugar (o de la tabla si no se jugó), 5.º en adelante de la
    tabla tras la ronda 2. Mientras un partido no se juega, sus dos equipos quedan en el orden de la tabla."""
    orden = [f.equipo_id for f in tabla_r2]
    rank = {e: i for i, e in enumerate(orden)}
    por_tabla = lambda xs: sorted(xs, key=lambda e: rank.get(e, 10**6))  # noqa: E731

    def bloque(p: Partido | None, defecto: list[int]) -> tuple[list[int], str]:
        if p is None:
            return defecto, "tabla"
        if p.jugado:
            return [p.ganador, p.perdedor], p.slot  # type: ignore[list-item]
        return por_tabla([p.a, p.b]), "tabla"

    top, origen_top = bloque(final, orden[:2])
    medio, origen_medio = bloque(tercero, orden[2:4])
    usados = set(top) | set(medio)
    resto = [e for e in orden if e not in usados]

    lugares: dict[int, int] = {}
    origen: dict[int, str] = {}
    for e in top:
        lugares[e], origen[e] = len(lugares) + 1, origen_top
    for e in medio:
        lugares[e], origen[e] = len(lugares) + 1, origen_medio
    base = len(lugares)
    por_fila = {f.equipo_id: f for f in tabla_r2}
    secuencia = {e: base + i + 1 for i, e in enumerate(resto)}
    for e in resto:
        fila = por_fila[e]
        # Los empates sin resolver comparten el primer lugar del grupo (solo es provisional).
        lugares[e] = min(secuencia[o] for o in resto if por_fila[o].lugar == fila.lugar) if fila.empate else secuencia[e]
        origen[e] = "tabla"
    return lugares, origen


def estado_torneo(
    equipo_ids: list[int],
    partidos: list[Partido],
    desempates: dict[tuple[str, frozenset[int]], list[int]],
) -> Estado:
    """Todo lo que la pantalla necesita saber del torneo: fase, tablas, empates por resolver, qué sigue,
    la propuesta de la siguiente ronda y los lugares finales."""
    validos = set(equipo_ids)
    ps = [p for p in partidos if p.a in validos and p.b in validos and p.a != p.b]
    rotos = len(partidos) - len(ps)
    por_numero = lambda xs: sorted(xs, key=lambda p: numero_de(p.slot))  # noqa: E731
    r1 = por_numero([p for p in ps if p.ronda == "r1"])
    r2 = por_numero([p for p in ps if p.ronda == "r2"])
    tercero = next((p for p in ps if p.slot == "tercero"), None)
    final = next((p for p in ps if p.slot == "final"), None)

    participantes = [e for p in r1 for e in (p.a, p.b)] if r1 else list(equipo_ids)
    fuera = [e for e in equipo_ids if e not in set(participantes)] if r1 else []
    d1 = {k[1]: v for k, v in desempates.items() if k[0] == "r1"}
    d2 = {k[1]: v for k, v in desempates.items() if k[0] == "r2"}

    r1_completa, r2_completa = _completa(r1), _completa(r2)
    tabla_r1 = calcular_tabla(participantes, r1, d1, marcar_empates=r1_completa) if r1 else None
    tabla_r2 = calcular_tabla(participantes, [*r1, *r2], d2, marcar_empates=r2_completa) if r2 else None
    tercero_saltado = bool(tercero and tercero.saltado)
    tercero_juega = not tercero_saltado

    # --- empates que importan (solo los de la ronda en curso)
    empates: list[Empate] = []
    if r2:
        if r2_completa and tabla_r2:
            empates = empates_pendientes(tabla_r2, "r2", tercero_juega)
    elif r1 and r1_completa and tabla_r1:
        empates = empates_pendientes(tabla_r1, "r1")
    bloqueantes = [e for e in empates if e.bloquea]

    # --- fase y qué sigue
    def pendientes(xs: list[Partido]) -> list[Partido]:
        return [p for p in xs if not p.jugado and not p.saltado]

    propuesta: Propuesta | None = None
    avisos: list[str] = []
    if not r1:
        fase = "sin_sorteo"
        ok = len(equipo_ids) >= MIN_EQUIPOS and len(equipo_ids) % 2 == 0
        siguiente = Siguiente("sortear" if ok else "sin_equipos")
    elif not r2:
        fase = "ronda1"
        pend = pendientes(r1)
        if pend:
            siguiente = Siguiente("capturar", len(pend), pend[0].slot, pend[1].slot if len(pend) > 1 else None)
        elif empates:
            siguiente = Siguiente("desempatar")
        else:
            siguiente = Siguiente("armar_ronda2")
            assert tabla_r1 is not None
            plan = parejas_ronda2([f.equipo_id for f in tabla_r1], _conjuntos([(p.a, p.b) for p in r1]))
            propuesta = Propuesta(
                "ronda2",
                [(f"r2-{i}", a, b) for i, (a, b) in enumerate(plan.pares, start=1)],
                plan.cambios,
                plan.ajustada,
                plan.con_revancha,
            )
    elif not (final or tercero):
        fase = "ronda2"
        pend = pendientes(r2)
        if pend:
            siguiente = Siguiente("capturar", len(pend), pend[0].slot, pend[1].slot if len(pend) > 1 else None)
        elif bloqueantes:
            siguiente = Siguiente("desempatar")
        else:
            siguiente = Siguiente("armar_finales")
            assert tabla_r2 is not None
            o = [f.equipo_id for f in tabla_r2]
            propuesta = Propuesta("finales", [("tercero", o[2], o[3]), ("final", o[0], o[1])])
    else:
        fase = "finales"
        pend = pendientes([p for p in (tercero, final) if p])
        if pend:
            siguiente = Siguiente("capturar", len(pend), pend[0].slot, pend[1].slot if len(pend) > 1 else None)
        elif empates:
            siguiente = Siguiente("desempatar")
        else:
            siguiente = Siguiente("terminado")

    # --- lugares (provisionales hasta que todo esté jugado y resuelto)
    lugares: dict[int, int] | None = None
    origen: dict[int, str] = {}
    if tabla_r2 and r2_completa:
        lugares, origen = _calcular_lugares(tabla_r2, final, tercero)
    definitivo = bool(
        lugares
        and final
        and final.jugado
        and (tercero is None or tercero.jugado or tercero.saltado)
        and not empates
    )
    if definitivo:
        fase = "terminado"
        siguiente = Siguiente("terminado")

    # --- avisos: una corrección dejó la ronda ya armada distinta de lo que hoy saldría
    if r2 and r1_completa and tabla_r1 and not any(f.empate for f in tabla_r1):
        hoy = parejas_ronda2([f.equipo_id for f in tabla_r1], _conjuntos([(p.a, p.b) for p in r1])).pares
        if _conjuntos(hoy) != _conjuntos([(p.a, p.b) for p in r2]):
            avisos.append(
                "La tabla de la ronda 1 cambió después de armar la ronda 2: con los marcadores de ahora saldrían otros "
                "partidos. Si la ronda 2 aún no tiene marcadores, puedes deshacerla y armarla de nuevo."
            )
    if (final or tercero) and r2_completa and tabla_r2 and not any(f.empate for f in tabla_r2):
        o = [f.equipo_id for f in tabla_r2]
        if final and frozenset(o[:2]) != frozenset((final.a, final.b)):
            avisos.append("Con los marcadores de ahora la gran final sería otra. Revisa la ronda 2 o deshaz las finales.")
        elif tercero and not tercero.saltado and frozenset(o[2:4]) != frozenset((tercero.a, tercero.b)):
            avisos.append("Con los marcadores de ahora el tercer lugar sería otro. Revisa la ronda 2 o deshaz las finales.")

    return Estado(
        fase=fase,  # type: ignore[arg-type]
        participantes=participantes,
        fuera=fuera,
        partidos_rotos=rotos,
        r1=r1,
        r2=r2,
        tercero=tercero,
        final=final,
        tabla_r1=tabla_r1,
        tabla_r2=tabla_r2,
        empates=empates,
        siguiente=siguiente,
        propuesta=propuesta,
        lugares=lugares,
        origen_lugar=origen,
        definitivo=definitivo,
        tercero_saltado=tercero_saltado,
        avisos=avisos,
    )
