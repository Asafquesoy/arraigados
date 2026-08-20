"""Algoritmo de reparto balanceado de equipos.

Módulo puro (sin FastAPI, sin sesión de DB) y determinista: para las mismas
entradas siempre produce el mismo reparto — nunca usa `random`. Una sola
función de costo (`costo_agregar`) alimenta tanto la asignación individual al
registrarse (`elegir_equipo`, llamada desde `routers/public.py`) como el
reparto masivo (`repartir`, llamado desde `routers/equipos.py`).

Los cinco criterios de `Criterios` se pueden apagar independientemente — cada
uno solo aporta a la suma de costo si está encendido, así que apagarlos todos
hace que el reparto elija siempre el equipo más chico (queda igual de
"parejo" en tamaño nada más).

Los consejeros (`TipoParticipante.CONSEJERO`) nunca entran a un equipo por sí
solos — ni al registrarse ni con "Repartir a todos" — solo si un admin los
mueve a mano desde `/admin/equipos` (lo que marca `equipo_fijado=True`,
ver `repartir()`). Por eso no existe un criterio de "consejeros repartidos":
como nunca son candidatos en `elegir_equipo`, no hay nada que balancear ahí.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date

from .models import Camper, Equipo, Sexo, TipoParticipante


@dataclass(frozen=True)
class Criterios:
    edad: bool = True
    bautismo: bool = True
    procedencia: bool = True
    sexo: bool = True
    tamano: bool = True


def meses_bautizado(camper: Camper, hoy: date | None = None) -> int | None:
    """Meses desde el bautismo, o None si no está bautizado / faltan datos.
    Quien devuelve None aquí no cuenta para el promedio de tiempo bautizado,
    pero sí se reparte parejo vía el subtérmino "sin dato" de costo_agregar."""
    if not camper.bautizado or not camper.bautismo_mes or not camper.bautismo_anio:
        return None
    hoy = hoy or date.today()
    return (hoy.year - camper.bautismo_anio) * 12 + (hoy.month - camper.bautismo_mes)


def _iglesia_key(c: Camper) -> str:
    return (c.iglesia or "").strip().casefold()


@dataclass
class _Contexto:
    edad_prom: float
    edad_rango: float
    bautismo_prom: float
    bautismo_rango: float
    prop_femenino: float


def construir_contexto(participantes: list[Camper], hoy: date) -> _Contexto:
    edades = [c.edad for c in participantes]
    bautismos = [m for c in participantes if (m := meses_bautizado(c, hoy)) is not None]
    total = len(participantes) or 1
    femeninos = sum(1 for c in participantes if c.sexo == Sexo.FEMENINO)
    return _Contexto(
        edad_prom=sum(edades) / len(edades) if edades else 0.0,
        edad_rango=max(edades) - min(edades) if edades else 0,
        bautismo_prom=sum(bautismos) / len(bautismos) if bautismos else 0.0,
        bautismo_rango=max(bautismos) - min(bautismos) if bautismos else 0,
        prop_femenino=femeninos / total,
    )


def costo_agregar(
    candidato: Camper,
    miembros_equipo: list[Camper],
    equipos_miembros: dict[int, list[Camper]],
    contexto: _Contexto,
    criterios: Criterios,
    hoy: date,
) -> float:
    """Costo de meter a `candidato` en un equipo que ya tiene `miembros_equipo`
    (sin contar al candidato). Menor es mejor. Cada término solo cuenta si su
    interruptor está encendido en `criterios`; todos están normalizados a
    ~0-1 para que ningún criterio domine a los demás por su escala natural."""
    costo = 0.0
    tamanos = [len(m) for m in equipos_miembros.values()]
    max_len = max(tamanos, default=0)

    if criterios.tamano:
        costo += len(miembros_equipo) / (max_len + 1)

    if criterios.edad:
        edades = [c.edad for c in miembros_equipo] + [candidato.edad]
        promedio = sum(edades) / len(edades)
        costo += abs(promedio - contexto.edad_prom) / max(1, contexto.edad_rango)

    if criterios.bautismo:
        meses_actuales = [m for c in miembros_equipo if (m := meses_bautizado(c, hoy)) is not None]
        m_candidato = meses_bautizado(candidato, hoy)
        meses_con_candidato = meses_actuales + ([m_candidato] if m_candidato is not None else [])
        if meses_con_candidato:
            promedio = sum(meses_con_candidato) / len(meses_con_candidato)
            costo += abs(promedio - contexto.bautismo_prom) / max(1, contexto.bautismo_rango)
        if m_candidato is None:
            sin_dato = sum(1 for c in miembros_equipo if meses_bautizado(c, hoy) is None)
            max_sin_dato = max(
                (sum(1 for c in m if meses_bautizado(c, hoy) is None) for m in equipos_miembros.values()),
                default=0,
            )
            costo += sin_dato / (max_sin_dato + 1)

    if criterios.procedencia:
        iglesia = _iglesia_key(candidato)
        if iglesia:
            misma_iglesia = sum(1 for c in miembros_equipo if _iglesia_key(c) == iglesia)
            max_iglesia = max(
                (sum(1 for c in m if _iglesia_key(c) == iglesia) for m in equipos_miembros.values()),
                default=0,
            )
            costo += 0.7 * (misma_iglesia / (max_iglesia + 1))
        if candidato.zona:
            misma_zona = sum(1 for c in miembros_equipo if c.zona == candidato.zona)
            max_zona = max(
                (sum(1 for c in m if c.zona == candidato.zona) for m in equipos_miembros.values()),
                default=0,
            )
            costo += 0.3 * (misma_zona / (max_zona + 1))

    if criterios.sexo:
        femeninos = sum(1 for c in miembros_equipo if c.sexo == Sexo.FEMENINO)
        total_con_candidato = len(miembros_equipo) + 1
        es_femenino = candidato.sexo == Sexo.FEMENINO
        prop = (femeninos + (1 if es_femenino else 0)) / total_con_candidato
        costo += abs(prop - contexto.prop_femenino)

    return costo


def elegir_equipo(
    candidato: Camper,
    equipos: list[Equipo],
    equipos_miembros: dict[int, list[Camper]],
    contexto: _Contexto,
    criterios: Criterios,
    hoy: date | None = None,
) -> Equipo:
    """El equipo que menos desequilibra al agregar a `candidato`. Desempate:
    menor costo → equipo más chico → `orden` → `id` (los últimos dos ya los
    da el orden de iteración de `equipos_ordenados`)."""
    hoy = hoy or date.today()
    equipos_ordenados = sorted(equipos, key=lambda e: (e.orden, e.id))

    mejor: Equipo | None = None
    mejor_costo = float("inf")
    mejor_tam: int | None = None
    for equipo in equipos_ordenados:
        miembros = equipos_miembros.get(equipo.id, [])
        costo = costo_agregar(candidato, miembros, equipos_miembros, contexto, criterios, hoy)
        tam = len(miembros)
        es_mejor = costo < mejor_costo - 1e-9 or (
            abs(costo - mejor_costo) <= 1e-9 and mejor_tam is not None and tam < mejor_tam
        )
        if mejor is None or es_mejor:
            mejor, mejor_costo, mejor_tam = equipo, costo, tam
    assert mejor is not None  # equipos no está vacío — lo garantiza el llamador
    return mejor


def _contribucion(
    c: Camper,
    equipo_id: int,
    equipos_miembros: dict[int, list[Camper]],
    contexto: _Contexto,
    criterios: Criterios,
    hoy: date,
) -> float:
    """Costo que aporta `c` a su equipo actual — se calcula como si se
    estuviera agregando a los demás miembros de ese mismo equipo. Es la
    unidad que usa el refinamiento para decidir si mover a alguien mejora el
    reparto global."""
    miembros_sin_c = [m for m in equipos_miembros[equipo_id] if m.id != c.id]
    return costo_agregar(c, miembros_sin_c, equipos_miembros, contexto, criterios, hoy)


def _refinar(
    equipos_miembros: dict[int, list[Camper]],
    contexto: _Contexto,
    criterios: Criterios,
    hoy: date,
    resultado: dict[int, int | None],
    movibles_ids: set[int],
    max_barridos: int = 3,
) -> None:
    """Hasta `max_barridos` pasadas de: para cada persona movible, ¿existe un
    equipo donde su contribución de costo sería menor? Si sí, la mueve. Se
    corta en la primera pasada sin mejoras. Nunca mueve a alguien fuera de
    `movibles_ids` (los fijados a mano quedan intactos)."""
    equipo_ids = list(equipos_miembros.keys())
    for _ in range(max_barridos):
        hubo_mejora = False
        for origen_id in equipo_ids:
            for c in list(equipos_miembros[origen_id]):
                if c.id not in movibles_ids:
                    continue
                costo_actual = _contribucion(c, origen_id, equipos_miembros, contexto, criterios, hoy)
                mejor_destino = origen_id
                mejor_costo = costo_actual
                for destino_id in equipo_ids:
                    if destino_id == origen_id:
                        continue
                    costo_destino = costo_agregar(
                        c, equipos_miembros[destino_id], equipos_miembros, contexto, criterios, hoy
                    )
                    if costo_destino < mejor_costo - 1e-6:
                        mejor_destino, mejor_costo = destino_id, costo_destino
                if mejor_destino != origen_id:
                    equipos_miembros[origen_id].remove(c)
                    equipos_miembros[mejor_destino].append(c)
                    resultado[c.id] = mejor_destino
                    hubo_mejora = True
        if not hubo_mejora:
            break


def repartir(
    participantes: list[Camper],
    equipos: list[Equipo],
    criterios: Criterios,
    incluir_fijados: bool = False,
) -> dict[int, int | None]:
    """Reparte `participantes` entre `equipos`. Devuelve {camper_id: equipo_id}
    (equipo_id puede ser None) solo para quienes cambiaron — quien se dejó
    fijo (porque un admin lo movió a mano y `incluir_fijados` es False) no
    aparece en el resultado.

    Los consejeros quedan siempre fuera de la colocación automática, sin
    importar `incluir_fijados`: solo tienen equipo si un admin los fijó a
    mano, y ese placement nunca lo toca esta función. Si alguno quedó con
    `equipo_id` sin estar fijado (de una asignación automática de antes de
    este comportamiento), aquí se libera."""
    if not equipos:
        return {}

    hoy = date.today()
    contexto = construir_contexto(participantes, hoy)

    consejeros_fijados = [
        c for c in participantes if c.tipo == TipoParticipante.CONSEJERO and c.equipo_fijado and c.equipo_id
    ]
    consejeros_sueltos = [
        c for c in participantes if c.tipo == TipoParticipante.CONSEJERO and not (c.equipo_fijado and c.equipo_id)
    ]
    no_consejeros = [c for c in participantes if c.tipo != TipoParticipante.CONSEJERO]

    if incluir_fijados:
        fijados: list[Camper] = list(consejeros_fijados)
        pendientes = list(no_consejeros)
    else:
        fijados = consejeros_fijados + [c for c in no_consejeros if c.equipo_fijado and c.equipo_id]
        pendientes = [c for c in no_consejeros if not (c.equipo_fijado and c.equipo_id)]

    equipos_miembros: dict[int, list[Camper]] = {e.id: [] for e in equipos}
    ids_validos = set(equipos_miembros)
    for c in fijados:
        if c.equipo_id in ids_validos:
            equipos_miembros[c.equipo_id].append(c)

    # Orden de colocación: primero los de iglesias grandes (lo más difícil de
    # repartir bien) — desempatado por id para que el resultado sea reproducible.
    conteo_iglesia: Counter[str] = Counter(_iglesia_key(c) for c in pendientes if _iglesia_key(c))

    def prioridad(c: Camper) -> tuple:
        tam_iglesia = conteo_iglesia.get(_iglesia_key(c), 0)
        return (-tam_iglesia, c.id)

    resultado: dict[int, int | None] = {c.id: None for c in consejeros_sueltos if c.equipo_id is not None}

    for c in sorted(pendientes, key=prioridad):
        equipo = elegir_equipo(c, equipos, equipos_miembros, contexto, criterios, hoy)
        equipos_miembros[equipo.id].append(c)
        resultado[c.id] = equipo.id

    movibles_ids = {c.id for c in pendientes}
    _refinar(equipos_miembros, contexto, criterios, hoy, resultado, movibles_ids)

    return resultado


def resumen_equipo(miembros: list[Camper], hoy: date | None = None) -> dict:
    """Estadísticas de un equipo ya formado — lo que consume `EquipoStats` en
    la respuesta de `GET /admin/equipos/distribucion`."""
    hoy = hoy or date.today()
    total = len(miembros)
    edades = [c.edad for c in miembros]
    tiempos_bautizado = [m for c in miembros if (m := meses_bautizado(c, hoy)) is not None]
    iglesias = {_iglesia_key(c) for c in miembros if _iglesia_key(c)}

    return {
        "total": total,
        "edad_promedio": round(sum(edades) / total, 1) if total else None,
        "bautizados": len(tiempos_bautizado),
        "bautismo_meses_promedio": round(sum(tiempos_bautizado) / len(tiempos_bautizado), 1)
        if tiempos_bautizado
        else None,
        "hombres": sum(1 for c in miembros if c.sexo == Sexo.MASCULINO),
        "mujeres": sum(1 for c in miembros if c.sexo == Sexo.FEMENINO),
        "consejeros": sum(1 for c in miembros if c.tipo == TipoParticipante.CONSEJERO),
        "iglesias_distintas": len(iglesias),
    }
