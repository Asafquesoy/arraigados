"""Conciliación de comprobantes: agrupa registros que comparten una transferencia
y decide si el dinero alcanza para todas las inscripciones de ese grupo.

Módulo puro (sin FastAPI ni sesión de BD, igual que equipos_balance.py): recibe
objetos con los atributos de `Camper` y devuelve estructuras simples.
"""

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta

from .comprobante_ocr import distancia_phash

# Tarifa por fecha de la transferencia. Son datos históricos de la campaña 2026
# (la tarifa que cobra hoy el formulario vive en app_settings.precio_mxn), así
# que aquí sí van como constante. (desde, hasta, pesos) — ambos extremos incluidos.
TARIFAS: list[tuple[date, date, int]] = [
    (date(2026, 8, 16), date(2026, 8, 31), 350),
    (date(2026, 9, 1), date(2026, 9, 30), 450),
    (date(2026, 10, 1), date(2026, 10, 31), 500),
    (date(2026, 11, 1), date(2026, 11, 12), 550),
]

PHASH_UMBRAL = 4          # bits distintos (de 64) para considerar "la misma captura"
TOLERANCIA_FECHA_DIAS = 3  # fecha leída vs fecha_pago que escribió la persona
MOTIVOS_FUERTES = {"misma imagen", "misma clave de rastreo", "mismo número de cupón"}
TIPOS_DINERO = ("transferencia", "deposito")
TIPOS_CUPON = ("campamento_gratis", "ticket_descuento")


def tarifa_para(dia: date) -> int:
    if dia < TARIFAS[0][0]:
        return TARIFAS[0][2]
    for desde, hasta, pesos in TARIFAS:
        if desde <= dia <= hasta:
            return pesos
    return TARIFAS[-1][2]


@dataclass
class Alerta:
    codigo: str
    nivel: str  # "alta" | "media" | "info"
    texto: str


@dataclass
class Chequeo:
    """Una cosa que SÍ se comprobó (o no) de un pago. ok=None: no hubo con qué comprobarlo."""

    codigo: str  # LEIDO | MONTO | FECHA | SIN_COPIAS
    ok: bool | None
    texto: str


@dataclass
class Grupo:
    ids: list[int]
    tipo: str | None
    monto_centavos: int | None
    fecha: date | None
    tarifa: int | None
    esperado: int | None
    cubre: int | None
    por_que_juntos: list[str] = field(default_factory=list)
    alertas: list[Alerta] = field(default_factory=list)
    chequeos: list[Chequeo] = field(default_factory=list)
    revisado: bool = False
    separado: bool = False  # alguien lo sacó a mano de un grupo ("no es el mismo pago")

    @property
    def clase(self) -> str:
        return "grupal" if len(self.ids) > 1 else "individual"

    @property
    def estado(self) -> str:
        if self.revisado:
            return "revisado"
        if any(a.nivel in ("alta", "media") for a in self.alertas):
            return "alerta"
        return "ok"


def _clave_ref(valor: str | None) -> str:
    # El OCR confunde O/0 e I/1; se igualan para que la misma clave leída dos
    # veces (p. ej. en capturas recomprimidas) siga coincidiendo.
    limpio = "".join(ch for ch in (valor or "").upper() if ch.isalnum())
    return limpio.translate(str.maketrans("OIL", "011"))


def _ref_es_fecha(ref: str, c) -> bool:
    """La referencia numérica de SPEI suele autollenarse con la fecha (ddmmyy)."""
    for d in (c.comp_fecha, c.fecha_pago):
        if d and ref in (f"{d:%d%m%y}", f"{d:%d%m%Y}", f"{d:%y%m%d}", f"{d:%Y%m%d}"):
            return True
    return False


def _tiene_datos(c) -> bool:
    return bool(c.comp_monto_centavos or c.comp_referencia or c.comp_clave_rastreo)


def _se_contradicen(a, b) -> bool:
    """True si ambos tienen un dato leído y es distinto (otra transferencia)."""
    pares = (
        (_clave_ref(a.comp_clave_rastreo), _clave_ref(b.comp_clave_rastreo)),
        (_clave_ref(a.comp_referencia), _clave_ref(b.comp_referencia)),
        (a.comp_monto_centavos, b.comp_monto_centavos),
        (a.comp_fecha, b.comp_fecha),
    )
    return any(x and y and x != y for x, y in pares)


class _UnionFind:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, x: int) -> int:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: int, b: int) -> None:
        self.p[self.find(a)] = self.find(b)


def fecha_efectiva(c) -> date:
    """Fecha que manda para la tarifa: la del comprobante, si no la que
    escribió la persona, si no el día en que se registró."""
    if c.comp_fecha:
        return c.comp_fecha
    if c.fecha_pago:
        return c.fecha_pago
    return c.created_at.date()


def agrupar(campers: list) -> tuple[list[Grupo], dict[int, list[str]]]:
    """Une registros que comparten imagen, clave de rastreo o referencia.
    Devuelve (grupos, motivos por id) — solo registros con comprobante."""
    con_ticket = [c for c in campers if c.ticket_path]
    uf = _UnionFind(len(con_ticket))
    motivos: dict[int, set[str]] = {c.id: set() for c in con_ticket}

    def unir(i: int, j: int, motivo: str) -> None:
        uf.union(i, j)
        motivos[con_ticket[i].id].add(motivo)
        motivos[con_ticket[j].id].add(motivo)

    por_clave: dict[tuple, int] = {}
    for i, c in enumerate(con_ticket):
        if c.comp_separado:
            continue  # lo sacaron a mano de un grupo: no se vuelve a unir solo
        claves: list[tuple[tuple, str]] = []
        if c.ticket_sha256:
            claves.append((("sha", c.ticket_sha256), "misma imagen"))
        rastreo = _clave_ref(c.comp_clave_rastreo)
        if len(rastreo) >= 8:
            claves.append((("rastreo", rastreo), "misma clave de rastreo"))
        ref = _clave_ref(c.comp_referencia)
        if c.comp_tipo in TIPOS_CUPON and ref:
            claves.append((("cupon", c.comp_tipo, ref), "mismo número de cupón"))
        elif len(ref) >= 4 and c.comp_monto_centavos and not _ref_es_fecha(ref, c):
            # la referencia sola puede coincidir entre bancos distintos: exigir mismo monto
            claves.append((("ref", ref, c.comp_monto_centavos), "misma referencia"))
        for clave, motivo in claves:
            if clave in por_clave:
                # la referencia es débil (se repite entre pagos distintos): si la clave
                # de rastreo o la fecha leídas difieren, son transferencias distintas.
                if clave[0] == "ref":
                    otro = con_ticket[por_clave[clave]]
                    # y hay referencias fijas que se repiten durante semanas: exigir ±1 día
                    if _se_contradicen(c, otro) or abs((fecha_efectiva(c) - fecha_efectiva(otro)).days) > 1:
                        continue
                unir(i, por_clave[clave], motivo)
            else:
                por_clave[clave] = i

    # capturas casi idénticas (recomprimidas / recortadas): comparación de a pares,
    # son ~200 registros como mucho así que O(n²) es trivial. Las capturas de dos
    # transferencias distintas del mismo banco comparten plantilla y salen casi
    # iguales al hash perceptual, así que nunca se une si lo leído se contradice.
    for i in range(len(con_ticket)):
        for j in range(i + 1, len(con_ticket)):
            if uf.find(i) == uf.find(j):
                continue
            a, b = con_ticket[i], con_ticket[j]
            if a.comp_separado or b.comp_separado:
                continue
            d = distancia_phash(a.ticket_phash, b.ticket_phash)
            if d > PHASH_UMBRAL or _se_contradicen(a, b):
                continue
            if d > 0 and not (_tiene_datos(a) and _tiene_datos(b)):
                continue  # sin datos que respalden, solo se une la imagen idéntica
            unir(i, j, "imagen casi igual")

    buckets: dict[int, list] = {}
    for i, c in enumerate(con_ticket):
        buckets.setdefault(uf.find(i), []).append(c)

    conteos = _contar_huellas([c for c in con_ticket if not c.comp_separado])
    grupos = [_evaluar(miembros, motivos, conteos) for miembros in buckets.values()]
    return grupos, {k: sorted(v) for k, v in motivos.items()}


def _contar_huellas(campers: list) -> Counter:
    """Cuántos comprobantes comparten cada imagen / clave de rastreo / referencia."""
    cuenta: Counter = Counter()
    for c in campers:
        if c.ticket_sha256:
            cuenta[("sha", c.ticket_sha256)] += 1
        rastreo = _clave_ref(c.comp_clave_rastreo)
        if len(rastreo) >= 8:
            cuenta[("rastreo", rastreo)] += 1
        ref = _clave_ref(c.comp_referencia)
        if len(ref) >= 4:
            cuenta[("ref", ref)] += 1
    return cuenta


FUENTES = {"gemini": "con IA", "local": "con el lector local", "manual": "a mano"}


def _chequeos(g: Grupo, miembros: list, base, leido: bool, conteos: Counter) -> list[Chequeo]:
    """Lo que se comprobó de este pago, para ver también lo que está bien y no solo las alertas."""
    n = len(miembros)
    out: list[Chequeo] = []

    if leido:
        out.append(Chequeo("LEIDO", True, f"Comprobante leído {FUENTES.get(base.ocr_fuente or '', '')}".strip()))
    else:
        out.append(Chequeo("LEIDO", False, "Aún no se lee el comprobante."))

    if g.tipo in TIPOS_DINERO and g.monto_centavos is not None and g.tarifa is not None:
        monto = f"${g.monto_centavos/100:,.0f}"
        if n == 1:
            out.append(
                Chequeo("MONTO", g.cubre >= 1, f"{monto} {'alcanza' if g.cubre >= 1 else 'no alcanza'} para la tarifa del {g.fecha:%d/%m} (${g.tarifa}).")
            )
        else:
            out.append(Chequeo("MONTO", g.cubre >= n, f"{monto} {'cubre' if g.cubre >= n else 'solo cubre ' + str(g.cubre) + ' de'} {n} × ${g.tarifa} = ${g.esperado/100:,.0f}."))
    elif g.tipo == "campamento_gratis":
        out.append(Chequeo("MONTO", True, "Cupón de campamento gratis (no lleva monto)."))
    elif g.tipo == "ticket_descuento":
        out.append(Chequeo("MONTO", None, "Ticket de descuento: confirma el monto a mano."))
    elif leido and g.tipo in TIPOS_DINERO:
        out.append(Chequeo("MONTO", False, "No se pudo leer el monto."))
    elif leido and g.tipo == "otro":
        out.append(Chequeo("MONTO", False, "No parece una transferencia ni un cupón."))

    declaradas = [m.fecha_pago for m in miembros if m.fecha_pago]
    if g.tipo in TIPOS_DINERO:
        if base.comp_fecha and declaradas:
            cerca = any(abs(base.comp_fecha - d) <= timedelta(days=TOLERANCIA_FECHA_DIAS) for d in declaradas)
            out.append(
                Chequeo(
                    "FECHA",
                    cerca,
                    f"La fecha del comprobante ({base.comp_fecha:%d/%m}) {'coincide con' if cerca else 'no coincide con'} la que dijo ({declaradas[0]:%d/%m}).",
                )
            )
        elif not base.comp_fecha:
            out.append(Chequeo("FECHA", None, "El comprobante no muestra fecha para comparar."))

    if any(m.comp_separado for m in miembros):
        out.append(Chequeo("SIN_COPIAS", None, "Se separó a mano de otro grupo: una persona confirmó que es otro pago."))
    elif n > 1:
        motivos = ", ".join(g.por_que_juntos) or "datos parecidos"
        # un cupón es canjeable una sola vez; una transferencia repetida solo es sana si alcanza para todos
        ok = False if g.tipo in TIPOS_CUPON else (None if g.cubre is None else g.cubre >= n)
        out.append(Chequeo("SIN_COPIAS", ok, f"Estos {n} registros comparten comprobante ({motivos})."))
    else:
        m = miembros[0]
        rastreo, ref = _clave_ref(m.comp_clave_rastreo), _clave_ref(m.comp_referencia)
        if m.ticket_sha256:
            unica = conteos[("sha", m.ticket_sha256)] <= 1
            out.append(Chequeo("SIN_COPIAS", unica, "La imagen no se repite en otro registro." if unica else "Hay otro registro con la misma imagen."))
        if len(rastreo) >= 8:
            unica = conteos[("rastreo", rastreo)] <= 1
            out.append(Chequeo("SIN_COPIAS", unica, "La clave de rastreo no se repite." if unica else "La clave de rastreo aparece en otro registro."))
        elif g.tipo in TIPOS_DINERO:
            out.append(Chequeo("SIN_COPIAS", None, "Sin clave de rastreo legible para comparar."))
        if len(ref) >= 4:
            unica = conteos[("ref", ref)] <= 1
            out.append(Chequeo("SIN_COPIAS", unica, "La referencia no se repite." if unica else "La referencia también aparece en otro registro (puede ser un valor fijo del banco)."))
    return out


def _evaluar(miembros: list, motivos: dict[int, set[str]], conteos: Counter | None = None) -> Grupo:
    # el dato "bueno" del grupo es el primero que tenga monto (la captura es la misma)
    base = next((m for m in miembros if m.comp_monto_centavos), miembros[0])
    tipo = base.comp_tipo
    fecha = base.comp_fecha or fecha_efectiva(base)
    n = len(miembros)
    monto = base.comp_monto_centavos
    g = Grupo(
        ids=[m.id for m in sorted(miembros, key=lambda m: m.created_at)],
        tipo=tipo,
        monto_centavos=monto,
        fecha=fecha,
        tarifa=None,
        esperado=None,
        cubre=None,
        por_que_juntos=sorted({x for m in miembros for x in motivos[m.id]}),
        revisado=all(m.comp_revisado for m in miembros),
        separado=any(m.comp_separado for m in miembros),
    )

    leido = all(m.ocr_estado in ("LEIDO", "INCOMPLETO") or m.comp_editado for m in miembros)
    if not leido:
        g.alertas.append(Alerta("SIN_LECTURA", "media", "Aún no se lee este comprobante."))

    if tipo in TIPOS_CUPON:
        g.alertas.append(
            Alerta(
                "CUPON",
                "media" if tipo == "ticket_descuento" else "info",
                "Cupón de campamento gratis." if tipo == "campamento_gratis" else "Ticket de descuento: confirmar el monto a mano.",
            )
        )
        if n > 1:
            g.alertas.append(
                Alerta("CAPTURA_REPETIDA", "alta", f"El mismo cupón aparece en {n} registros (es canjeable por una inscripción).")
            )
    elif tipo in TIPOS_DINERO:
        if monto is None:
            if leido:
                g.alertas.append(Alerta("SIN_MONTO", "media", "No se pudo leer el monto."))
        else:
            g.tarifa = tarifa_para(fecha)
            g.esperado = g.tarifa * n * 100
            g.cubre = monto // (g.tarifa * 100)
            if n == 1 and monto < g.tarifa * 100:
                g.alertas.append(
                    Alerta("FALTA_DINERO", "alta", f"Pagó ${monto/100:,.0f} y la tarifa del {fecha:%d/%m} era ${g.tarifa}.")
                )
            elif n > 1 and g.cubre < n:
                # unidos solo por parecido visual (sin clave/imagen idéntica): puede ser
                # la misma plantilla bancaria con otra transferencia → que lo confirme una persona
                # (o solo por referencia, que se repite entre pagos distintos)
                parecida = not set(g.por_que_juntos) & MOTIVOS_FUERTES
                g.alertas.append(
                    Alerta(
                        "CAPTURA_REPETIDA",
                        "media" if parecida else "alta",
                        ("Posible captura repetida: la" if parecida else "La")
                        + f" transferencia (${monto/100:,.0f}) aparece en {n} registros pero solo cubre {g.cubre}.",
                    )
                )
            elif monto > g.esperado + 100 * (g.tarifa // 2):
                g.alertas.append(
                    Alerta("SOBRA_DINERO", "info", f"Transfirió ${monto/100:,.0f}; {n} inscripción(es) suman ${g.esperado/100:,.0f}.")
                )
            if n > 1 and g.cubre >= n:
                g.alertas.append(Alerta("COMPARTIDO", "info", f"Una transferencia paga {n} inscripciones."))
    elif tipo == "otro" and leido:
        g.alertas.append(Alerta("NO_PARECE_PAGO", "media", "No parece una transferencia ni un cupón."))

    declaradas = [m.fecha_pago for m in miembros if m.fecha_pago]
    if tipo in TIPOS_DINERO and base.comp_fecha and declaradas:
        if all(abs(base.comp_fecha - d) > timedelta(days=TOLERANCIA_FECHA_DIAS) for d in declaradas):
            g.alertas.append(
                Alerta("FECHA_NO_COINCIDE", "media", f"Comprobante del {base.comp_fecha:%d/%m} pero dijo haber pagado el {declaradas[0]:%d/%m}.")
            )
    if any(m.tiene_promocion for m in miembros):
        g.alertas.append(Alerta("PROMOCION", "info", "Dijo tener promoción: " + "; ".join(m.promocion_detalle or "sí" for m in miembros if m.tiene_promocion)[:120]))
    g.chequeos = _chequeos(g, miembros, base, leido, conteos if conteos is not None else Counter())
    return g
