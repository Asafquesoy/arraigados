"""Catálogo de juegos del campamento y cuentas de sus calificaciones.

Módulo puro (sin FastAPI ni sesión de BD, igual que `equipos_balance.py`).

**Agregar un juego = agregar una entrada a `JUEGOS`**: el frontend dibuja el formulario de
captura y las tablas a partir de este catálogo, y la base de datos guarda solo los valores
crudos que puso quien calificó (`80`, `true`/`false`, un tiempo en segundos), nunca los puntos ya
convertidos — así que si cambia lo que vale algo, todo se recalcula solo y no hace falta migración.

Hay dos modos de juego (`Juego.modo`):

**`jueces`** (Sketch, Voleibol): cada juez califica a cada equipo con una hoja de criterios.
- `escala`: el juez pone un número de 0 a `escala_max` (100) y se convierte proporcional
  (80 de 100 en un criterio de 200 puntos = 160).
- `si_no`: el juez solo marca sí/no; sí da todos los puntos del criterio y no da 0.
- Un equipo puede tener varias hojas: su puntaje es el **promedio** de sus hojas, criterio por criterio.

**`estaciones`** (Rally sucio, Búsqueda del tesoro): el juego es una serie de estaciones, cada una con
su encargado y su hoja de papel con los 10 equipos en renglones. Se guarda **una fila por equipo y
estación** (en la tabla `calificaciones`, con la clave de la estación en el campo `juez`) con lo que
marcó el encargado, y el puntaje del equipo es la **suma** de sus estaciones. Las reglas están en
`reglas-juegos/Concentrado de puntajes 2026.md`; aquí se implementan tal cual, incluidos los supuestos
marcados con ⚠ en ese documento.
"""

import math
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Literal

TipoCriterio = Literal["escala", "si_no"]
ModoJuego = Literal["jueces", "estaciones"]
TipoEstacion = Literal["rally", "busqueda", "capilla"]
# Cómo se mide lo que lograron en un juego del rally que no terminaron (concentrado 2.4):
# nivel = ¼ ½ ¾ · conteo = «__ de __» · son_logro = «son __ · cruzaron __» · lados = 0 a 4.
TipoAvance = Literal["nivel", "conteo", "son_logro", "lados"]


@dataclass(frozen=True)
class Criterio:
    clave: str
    nombre: str
    descripcion: str
    tipo: TipoCriterio
    puntos: int
    escala_max: int = 100


@dataclass(frozen=True)
class Estacion:
    clave: str
    nombre: str
    tipo: TipoEstacion
    subtitulo: str = ""  # búsqueda: la señal de la estación (Luz blanca, Pandero…)
    limite_seg: int = 0  # rally: tiempo límite del juego
    avance: TipoAvance | None = None  # rally: qué se anota si no terminaron
    etiqueta_avance: str = ""  # «Globos que salieron», «cruzaron», «apagaron su vela»…
    total_sugerido: int | None = None  # rally/conteo: el «de __» que casi siempre es el mismo
    orden_equipos: tuple[str, ...] = ()  # orden de los renglones en la hoja de papel (por nombre)

    @property
    def puntos_max(self) -> int:
        return PUNTOS_MAX_ESTACION[self.tipo]


PUNTOS_MAX_ESTACION: dict[str, int] = {"rally": 100, "busqueda": 70, "capilla": 100}


@dataclass(frozen=True)
class Juego:
    clave: str
    nombre: str
    descripcion: str
    criterios: tuple[Criterio, ...] = field(default_factory=tuple)
    modo: ModoJuego = "jueces"
    estaciones: tuple[Estacion, ...] = field(default_factory=tuple)

    @property
    def puntos_max(self) -> int:
        if self.modo == "estaciones":
            return sum(e.puntos_max for e in self.estaciones)
        return sum(c.puntos for c in self.criterios)

    def estacion(self, clave: str) -> Estacion | None:
        return next((e for e in self.estaciones if e.clave == clave), None)


# --- Rally sucio ---------------------------------------------------------------------------
# Mismo orden de equipos en las 10 hojas del encargado.
_ORDEN_RALLY = (
    "Cedros", "Olivos", "Robles", "Jacarandas", "Sequoias",
    "Acacias", "Cipreses", "Ahuehuetes", "Palmas", "Sauces",
)  # fmt: skip


def _rally(clave: str, nombre: str, limite_min: int, avance: TipoAvance, etiqueta: str = "", total: int | None = None) -> Estacion:
    return Estacion(
        clave=clave,
        nombre=nombre,
        tipo="rally",
        limite_seg=limite_min * 60,
        avance=avance,
        etiqueta_avance=etiqueta,
        total_sugerido=total,
        orden_equipos=_ORDEN_RALLY,
    )


_ESTACIONES_RALLY = (
    _rally("botella", "Llena la botella", 8, "nivel"),
    _rally("tubo", "Llena el tubo", 8, "conteo", "Globos que salieron", 7),
    _rally("cubeta", "Llena la cubeta", 8, "nivel"),
    _rally("pelota", "Alcanza la pelota", 8, "conteo", "Pelotas recogidas", 10),
    _rally("paciencia", "Paciencia de Campeones", 10, "conteo", "Pelotas sacadas", 25),
    _rally("canaleta", "Canaleta", 8, "conteo", "Canicas en la cubeta", 4),
    _rally("cuerdas", "Entre las cuerdas", 8, "son_logro", "cruzaron"),
    _rally("velas", "Apaga las velas", 8, "son_logro", "apagaron su vela"),
    _rally("telarana", "La telaraña", 10, "son_logro", "cruzaron"),
    _rally("ciegos", "Ciegos y mudos", 8, "lados", "Lados bien formados"),
)

# --- Búsqueda del tesoro -------------------------------------------------------------------
# (clave, nombre, señal, orden de los equipos en SU hoja — cambia en cada estación)
_ESTACIONES_BUSQUEDA_DATOS: tuple[tuple[str, str, str, tuple[str, ...]], ...] = (
    ("raiz", "Raíz", "Luz blanca",
     ("Olivos", "Robles", "Cedros", "Jacarandas", "Cipreses", "Acacias", "Sequoias", "Palmas", "Ahuehuetes", "Sauces")),
    ("amor", "Amor", "Luz roja",
     ("Cedros", "Cipreses", "Olivos", "Acacias", "Palmas", "Ahuehuetes", "Robles", "Sauces", "Sequoias", "Jacarandas")),
    ("gozo", "Gozo", "Pandero",
     ("Cipreses", "Jacarandas", "Sauces", "Sequoias", "Cedros", "Robles", "Olivos", "Acacias", "Palmas", "Ahuehuetes")),
    ("paz", "Paz", "Flauta dulce",
     ("Palmas", "Cedros", "Acacias", "Sauces", "Ahuehuetes", "Jacarandas", "Cipreses", "Sequoias", "Olivos", "Robles")),
    ("paciencia", "Paciencia", "Despertador",
     ("Sauces", "Acacias", "Cipreses", "Palmas", "Sequoias", "Olivos", "Jacarandas", "Ahuehuetes", "Robles", "Cedros")),
    ("benignidad", "Benignidad", "Silbato de colibrí",
     ("Ahuehuetes", "Sauces", "Sequoias", "Cedros", "Olivos", "Cipreses", "Acacias", "Robles", "Jacarandas", "Palmas")),
    ("bondad", "Bondad", "Matraca",
     ("Sequoias", "Ahuehuetes", "Robles", "Olivos", "Jacarandas", "Palmas", "Sauces", "Cipreses", "Cedros", "Acacias")),
    ("fe", "Fe", "Luz azul",
     ("Acacias", "Sequoias", "Palmas", "Ahuehuetes", "Robles", "Sauces", "Cedros", "Jacarandas", "Cipreses", "Olivos")),
    ("mansedumbre", "Mansedumbre", "Silbato de jaguar",
     ("Jacarandas", "Olivos", "Ahuehuetes", "Robles", "Sauces", "Sequoias", "Palmas", "Cedros", "Acacias", "Cipreses")),
    ("templanza", "Templanza", "Silbato",
     ("Robles", "Palmas", "Jacarandas", "Cipreses", "Acacias", "Cedros", "Ahuehuetes", "Olivos", "Sauces", "Sequoias")),
)  # fmt: skip

_ESTACIONES_BUSQUEDA = tuple(
    Estacion(clave=c, nombre=n, tipo="busqueda", subtitulo=s, orden_equipos=o) for c, n, s, o in _ESTACIONES_BUSQUEDA_DATOS
) + (
    Estacion(
        clave="capilla",
        nombre="Capilla · La meta",
        tipo="capilla",
        subtitulo="Solo los 3 primeros equipos que resuelven el acertijo",
    ),
)


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
    Juego(
        clave="busqueda_tesoro",
        nombre="Búsqueda del tesoro",
        descripcion=(
            "10 estaciones (Raíz y los 9 frutos del Espíritu) de hasta 70 puntos y la capilla de hasta 100. "
            "Gana quien más puntos junta; si hay empate, quien sumó menos tiempo en las estaciones."
        ),
        modo="estaciones",
        estaciones=_ESTACIONES_BUSQUEDA,
    ),
    Juego(
        clave="rally_sucio",
        nombre="Rally sucio",
        descripcion=(
            "10 juegos de hasta 100 puntos: cuenta en qué tercio del tiempo terminan, o cuánto lograron, "
            "y la Prueba de raíz (si fallan, la mitad). Si hay empate gana quien sumó menos tiempo."
        ),
        modo="estaciones",
        estaciones=_ESTACIONES_RALLY,
    ),
    # Reglas pendientes: se llenan con `criterios=(...)` cuando se definan.
    Juego(clave="voleibol_gigante", nombre="Voleibol gigante", descripcion=""),
)

_POR_CLAVE = {j.clave: j for j in JUEGOS}


def obtener_juego(clave: str) -> Juego | None:
    return _POR_CLAVE.get(clave)


# ==========================================================================================
# Modo `jueces`
# ==========================================================================================


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


# ==========================================================================================
# Modo `estaciones`
# ==========================================================================================

# Valores guardados por fila (lo que marcó el encargado, tal cual):
#   rally:    {"prueba": bool, "termino": bool,
#              si termino: "tiempo": segundos
#              si no: "nivel": 0-3 | "logrado"+"total" | "son"+"logro" | "lados": 0-4 (según la estación)}
#   busqueda: {"unidad": bool, "pregunta": "F"|"D", "pregunta_ok": bool, "palabra": bool,
#              "fruto": [bool, bool, bool], "tiempo": segundos}
#   capilla:  {"lugar": 1|2|3, "recitacion": "sin_errores"|"errores"|"leyendo", "tiempo"?: segundos}

TIEMPO_MAX_BUSQUEDA = 2 * 60 * 60  # tope de cordura para un tiempo escrito a mano
RECITACION = {"sin_errores": 40, "errores": 20, "leyendo": 0}
LUGAR_CAPILLA = {1: 60, 2: 40, 3: 30}


def fmt_tiempo(seg: int) -> str:
    """135 → «2:15»."""
    return f"{seg // 60}:{seg % 60:02d}"


def _es_entero(v: object, minimo: int, maximo: int) -> bool:
    return type(v) is int and minimo <= v <= maximo


def _tiempo(v: object, maximo: int) -> int:
    if not _es_entero(v, 1, maximo):
        raise ValueError("Escribe el tiempo en minutos y segundos (por ejemplo 2:15).")
    return v  # type: ignore[return-value]


def _si_no(v: object, mensaje: str) -> bool:
    if type(v) is not bool:
        raise ValueError(mensaje)
    return v


def validar_fila(estacion: Estacion, valores: dict) -> dict:
    """Valida lo que marcó el encargado en un renglón de su hoja y lo devuelve limpio (solo lo que
    cuenta: p. ej. un rally que terminó no guarda «nivel»). Lanza `ValueError` con un mensaje listo
    para mostrar."""
    if estacion.tipo == "rally":
        return _validar_rally(estacion, valores)
    if estacion.tipo == "busqueda":
        return _validar_busqueda(valores)
    return _validar_capilla(valores)


def _validar_rally(est: Estacion, v: dict) -> dict:
    limpio: dict = {"prueba": _si_no(v.get("prueba"), "Marca la Prueba de raíz (✔ o ✖).")}
    termino = _si_no(v.get("termino"), "Indica si terminó o si no terminó.")
    limpio["termino"] = termino
    if termino:
        t = v.get("tiempo")
        if not _es_entero(t, 1, 10**6):
            raise ValueError("Escribe en cuánto tiempo terminó (minutos y segundos, por ejemplo 2:15).")
        if t > est.limite_seg:
            raise ValueError(
                f"El tiempo ({fmt_tiempo(t)}) pasa del límite de {fmt_tiempo(est.limite_seg)}: si se acabó el tiempo, marca «No terminó»."
            )
        limpio["tiempo"] = t
        return limpio

    if est.avance == "nivel":
        nivel = v.get("nivel", 0)
        if nivel is None:
            nivel = 0
        if not _es_entero(nivel, 0, 3):
            raise ValueError("El nivel de agua es ¼, ½ o ¾ (o ninguno).")
        limpio["nivel"] = nivel
    elif est.avance == "conteo":
        logrado, total = v.get("logrado"), v.get("total")
        if not _es_entero(total, 1, 200) or not _es_entero(logrado, 0, 200):
            raise ValueError(f"Anota «{est.etiqueta_avance}» y de cuántos eran.")
        if logrado > total:
            raise ValueError(f"«{est.etiqueta_avance}» no puede ser más que el total.")
        limpio["logrado"], limpio["total"] = logrado, total
    elif est.avance == "son_logro":
        son, logro = v.get("son"), v.get("logro")
        if not _es_entero(son, 1, 100) or not _es_entero(logro, 0, 100):
            raise ValueError(f"Anota cuántos eran y cuántos {est.etiqueta_avance}.")
        if logro > son:
            raise ValueError(f"No pueden haber {est.etiqueta_avance} más de los que eran.")
        limpio["son"], limpio["logro"] = son, logro
    else:  # lados
        if not _es_entero(v.get("lados"), 0, 4):
            raise ValueError("Marca cuántos lados quedaron bien formados (0 a 4).")
        limpio["lados"] = v["lados"]
    return limpio


def _validar_busqueda(v: dict) -> dict:
    pregunta = v.get("pregunta")
    if pregunta not in ("F", "D"):
        raise ValueError("Marca si la pregunta fue Fácil (F) o Difícil (D).")
    fruto = v.get("fruto")
    if not isinstance(fruto, list) or len(fruto) != 3 or any(type(x) is not bool for x in fruto):
        raise ValueError("Marca ✔ o ✖ en las 3 situaciones de «¿Fruto o carne?».")
    return {
        "unidad": _si_no(v.get("unidad"), "Marca Unidad (✔ o ✖)."),
        "pregunta": pregunta,
        "pregunta_ok": _si_no(v.get("pregunta_ok"), "Marca si respondieron bien la pregunta (✔ o ✖)."),
        "palabra": _si_no(v.get("palabra"), "Marca Palabra (✔ o ✖)."),
        "fruto": list(fruto),
        "tiempo": _tiempo(v.get("tiempo"), TIEMPO_MAX_BUSQUEDA),
    }


def _validar_capilla(v: dict) -> dict:
    if not _es_entero(v.get("lugar"), 1, 3):
        raise ValueError("El lugar en que resolvieron el acertijo es 1.º, 2.º o 3.º.")
    if v.get("recitacion") not in RECITACION:
        raise ValueError("Marca cómo recitaron: sin errores, 1 a 3 errores o leyendo.")
    limpio: dict = {"lugar": v["lugar"], "recitacion": v["recitacion"]}
    if v.get("tiempo") not in (None, ""):
        limpio["tiempo"] = _tiempo(v["tiempo"], TIEMPO_MAX_BUSQUEDA)
    return limpio


def validar_lugares_capilla(filas: list[dict]) -> None:
    """La capilla es una hoja de 3 renglones: no puede haber dos equipos en el mismo lugar."""
    lugares = [f["lugar"] for f in filas]
    if len(set(lugares)) != len(lugares):
        raise ValueError("Dos equipos no pueden quedar en el mismo lugar de la capilla.")


def _redondear(x: Fraction) -> int:
    """Al entero más cercano, la mitad hacia arriba (el `round` de Python redondea 0.5 al par)."""
    return math.floor(x + Fraction(1, 2))


def _avance(est: Estacion, v: dict) -> Fraction:
    """Fracción de 0 a 1 de lo que lograron en un juego del rally que no terminaron. Tolerante."""
    def frac(num: object, den: object) -> Fraction:
        if type(num) is int and type(den) is int and den > 0 and num >= 0:
            return min(Fraction(num, den), Fraction(1))
        return Fraction(0)

    if est.avance == "nivel":
        return frac(v.get("nivel"), 4) if _es_entero(v.get("nivel"), 0, 3) else Fraction(0)
    if est.avance == "conteo":
        return frac(v.get("logrado"), v.get("total"))
    if est.avance == "son_logro":
        return frac(v.get("logro"), v.get("son"))
    return frac(v.get("lados"), 4) if _es_entero(v.get("lados"), 0, 4) else Fraction(0)


def base_rally(est: Estacion, v: dict) -> Fraction:
    """Puntos base de un juego del rally, antes de la Prueba de raíz: 100/80/60 según el tercio del
    tiempo límite en que terminó (el borde cuenta en la franja de arriba) o 40 × avance si no terminó."""
    if v.get("termino") is True:
        t = v.get("tiempo")
        if type(t) is not int or t <= 0:
            return Fraction(0)
        if t * 3 <= est.limite_seg:
            return Fraction(100)
        if t * 3 <= 2 * est.limite_seg:
            return Fraction(80)
        return Fraction(60)
    return 40 * _avance(est, v)


def _puntos_rally(est: Estacion, v: dict) -> tuple[dict[str, float], float]:
    base = base_rally(est, v)
    final = _redondear(base * (Fraction(1) if v.get("prueba") is True else Fraction(1, 2)))
    return {"base": round(float(base), 1), "final": float(final)}, float(final)


def _puntos_busqueda(v: dict) -> tuple[dict[str, float], float]:
    fruto = v.get("fruto")
    aciertos = sum(1 for x in fruto if x is True) if isinstance(fruto, list) else 0
    t = v.get("tiempo")
    if type(t) is not int:
        bono = 0
    elif t <= 180:
        bono = 10
    elif t <= 240:
        bono = 6
    elif t <= 300:
        bono = 2
    else:
        bono = 0
    desglose = {
        "unidad": 10 if v.get("unidad") is True else 0,
        "pregunta": (20 if v.get("pregunta") == "D" else 10) if v.get("pregunta_ok") is True else 0,
        "palabra": 10 if v.get("palabra") is True else 0,
        "fruto": 6 * aciertos + (2 if aciertos == 3 else 0),
        "tiempo": bono,
    }
    return {k: float(x) for k, x in desglose.items()}, float(sum(desglose.values()))


def _puntos_capilla(v: dict) -> tuple[dict[str, float], float]:
    lugar = LUGAR_CAPILLA.get(v.get("lugar"), 0) if type(v.get("lugar")) is int else 0
    recitacion = RECITACION.get(v.get("recitacion"), 0)
    return {"lugar": float(lugar), "recitacion": float(recitacion)}, float(lugar + recitacion)


def puntos_fila(est: Estacion, valores: dict) -> tuple[dict[str, float], float]:
    """Puntos de un renglón de la hoja: `(desglose, total)`. Tolerante con lo que falte."""
    if est.tipo == "rally":
        return _puntos_rally(est, valores)
    if est.tipo == "busqueda":
        return _puntos_busqueda(valores)
    return _puntos_capilla(valores)


def tiempo_estacion(est: Estacion, valores: dict | None) -> int | None:
    """Segundos que cuentan para el desempate. Rally: lo que tardaron, o el límite si no terminaron o
    no pasaron por el juego (`valores=None`). Búsqueda: lo que tardaron en la estación (si no pasaron,
    no cuenta: `None`). La capilla no cuenta para el desempate."""
    if est.tipo == "rally":
        if valores and valores.get("termino") is True and type(valores.get("tiempo")) is int:
            return valores["tiempo"]
        return est.limite_seg
    if est.tipo == "busqueda":
        t = (valores or {}).get("tiempo")
        return t if type(t) is int else None
    return None


# ==========================================================================================
# Resultados (los dos modos)
# ==========================================================================================


@dataclass
class ResultadoEquipo:
    equipo_id: int
    hojas: int  # modo jueces: hojas capturadas · modo estaciones: estaciones capturadas
    por_criterio: dict[str, float]  # modo estaciones: puntos por estación (clave de la estación)
    total: float
    posicion: int | None  # None = todavía sin hojas ni puntos extra
    tiempo_seg: int | None = None  # solo modo estaciones: desempate
    extra: float = 0.0  # puntos extra (+) o descuentos (−) de este juego; ya incluidos en `total`


def _posiciones(totales: list[float | None]) -> list[int | None]:
    """Posición de cada elemento por total descendente; los empates comparten posición
    (1, 1, 3…) y `None` (sin datos) no tiene posición."""
    con_datos = sorted((t for t in totales if t is not None), reverse=True)
    return [None if t is None else con_datos.index(t) + 1 for t in totales]


def _posiciones_con_desempate(claves: list[tuple[float, int] | None]) -> list[int | None]:
    """Como `_posiciones`, pero cada elemento es `(total, tiempo)`: más puntos primero y, a igual
    puntaje, menos tiempo. Solo empatan (comparten lugar) los que igualan en las dos cosas."""
    llaves = [None if c is None else (-c[0], c[1]) for c in claves]
    validas = [k for k in llaves if k is not None]
    return [None if k is None else 1 + sum(1 for o in validas if o < k) for k in llaves]


def _resultados_jueces(
    juego: Juego, equipo_ids: list[int], hojas: list[tuple[int, str, dict]], extra: dict[int, float]
) -> list[ResultadoEquipo]:
    por_equipo: dict[int, list[dict[str, float]]] = {}
    for equipo_id, _juez, valores in hojas:
        por_equipo.setdefault(equipo_id, []).append(puntos_hoja(juego, valores)[0])

    filas: list[ResultadoEquipo] = []
    for equipo_id in equipo_ids:
        lista = por_equipo.get(equipo_id, [])
        n = len(lista)
        promedio = {c.clave: (sum(h[c.clave] for h in lista) / n if n else 0.0) for c in juego.criterios}
        ex = round(extra.get(equipo_id, 0.0), 1)
        total = round(sum(promedio.values()) + ex, 1)
        filas.append(
            ResultadoEquipo(
                equipo_id=equipo_id,
                hojas=n,
                por_criterio={k: round(v, 1) for k, v in promedio.items()},
                total=total,
                posicion=None,
                extra=ex,
            )
        )

    # Tiene lugar quien ya tiene hojas o puntos extra (un descuento antes de calificar también cuenta).
    for fila, pos in zip(filas, _posiciones([f.total if (f.hojas or f.extra) else None for f in filas])):
        fila.posicion = pos
    return sorted(filas, key=lambda f: (f.posicion is None, f.posicion or 0))


# Tiempo de desempate de un equipo sin hojas pero con puntos extra: pierde cualquier desempate.
_TIEMPO_SIN_HOJAS = 10**9


def _resultados_estaciones(
    juego: Juego, equipo_ids: list[int], hojas: list[tuple[int, str, dict]], extra: dict[int, float]
) -> list[ResultadoEquipo]:
    por_equipo: dict[int, dict[str, dict]] = {}
    for equipo_id, estacion_clave, valores in hojas:
        por_equipo.setdefault(equipo_id, {})[estacion_clave] = valores

    filas: list[ResultadoEquipo] = []
    for equipo_id in equipo_ids:
        capturadas = por_equipo.get(equipo_id, {})
        por_estacion: dict[str, float] = {}
        tiempo = 0
        n = 0
        for est in juego.estaciones:
            valores = capturadas.get(est.clave)
            if valores is not None:
                n += 1
                por_estacion[est.clave] = puntos_fila(est, valores)[1]
            t = tiempo_estacion(est, valores)
            if t is not None:
                tiempo += t
        ex = round(extra.get(equipo_id, 0.0), 1)
        filas.append(
            ResultadoEquipo(
                equipo_id=equipo_id,
                hojas=n,
                por_criterio=por_estacion,
                total=round(sum(por_estacion.values()) + ex, 1),
                posicion=None,
                tiempo_seg=tiempo or None,  # sin tiempo (nada capturado, o solo la capilla) = None
                extra=ex,
            )
        )

    claves = [
        (f.total, f.tiempo_seg or 0) if f.hojas else ((f.total, _TIEMPO_SIN_HOJAS) if f.extra else None)
        for f in filas
    ]
    for fila, pos in zip(filas, _posiciones_con_desempate(claves)):
        fila.posicion = pos
    return sorted(filas, key=lambda f: (f.posicion is None, f.posicion or 0))


def resultados(
    juego: Juego,
    equipo_ids: list[int],
    hojas: list[tuple[int, str, dict]],
    extra: dict[int, float] | None = None,
) -> list[ResultadoEquipo]:
    """Resultado de un juego por equipo, ordenado por posición (los que aún no tienen hojas ni puntos
    extra van al final, en el orden en que llegaron en `equipo_ids`). `hojas` = `(equipo_id, juez,
    valores)`; en modo estaciones `juez` es la clave de la estación. `extra` = puntos extra (+) o
    descuentos (−) de ESTE juego por equipo: se suman al total y por lo tanto mueven la posición."""
    extra = extra or {}
    if juego.modo == "estaciones":
        return _resultados_estaciones(juego, equipo_ids, hojas, extra)
    return _resultados_jueces(juego, equipo_ids, hojas, extra)


@dataclass
class PosicionGeneral:
    equipo_id: int
    por_juego: dict[str, float | None]  # None = sin hojas ni extra en ese juego (ya incluye el extra del juego)
    posicion_por_juego: dict[str, int | None]  # lugar del equipo dentro de cada juego
    extra: float  # puntos extra generales (sin juego); ya incluidos en `total`
    total: float
    posicion: int | None


def tabla_general(
    equipo_ids: list[int],
    resultados_por_juego: dict[str, list[ResultadoEquipo]],
    extra_general: dict[int, float] | None = None,
) -> list[PosicionGeneral]:
    """Suma de los juegos (cada uno con sus puntos extra) más los puntos extra generales. Un equipo sin
    hojas en ningún juego y sin ningún punto extra no tiene posición."""
    extra_general = extra_general or {}
    filas: list[PosicionGeneral] = []
    for equipo_id in equipo_ids:
        por_juego: dict[str, float | None] = {}
        posicion_por_juego: dict[str, int | None] = {}
        for clave, res in resultados_por_juego.items():
            fila = next((r for r in res if r.equipo_id == equipo_id), None)
            con_datos = bool(fila and (fila.hojas or fila.extra))
            por_juego[clave] = fila.total if con_datos else None
            posicion_por_juego[clave] = fila.posicion if fila else None
        ex = round(extra_general.get(equipo_id, 0.0), 1)
        total = round(sum(v for v in por_juego.values() if v is not None) + ex, 1)
        filas.append(PosicionGeneral(equipo_id, por_juego, posicion_por_juego, ex, total, None))

    totales = [f.total if f.extra or any(v is not None for v in f.por_juego.values()) else None for f in filas]
    for fila, pos in zip(filas, _posiciones(totales)):
        fila.posicion = pos
    return sorted(filas, key=lambda f: (f.posicion is None, f.posicion or 0))
