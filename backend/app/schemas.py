from datetime import date, datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from .models import AdminRole, Sexo, TallaCamisa, TipoParticipante, Zona


class CamperCreateResponse(BaseModel):
    folio: str
    nombre: str


class EquipoBrief(BaseModel):
    """Versión mínima del equipo embebida en CamperOut — solo lo que la
    tabla/tarjetas del panel necesitan para pintar el chip de equipo."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    color: str


class CamperOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folio: str
    nombre: str
    ciudad: str | None
    iglesia: str
    edad: int
    sexo: Sexo
    zona: Zona | None
    tipo: TipoParticipante | None
    telefono: str | None
    fecha_pago: date | None
    tiene_promocion: bool | None
    promocion_detalle: str | None
    bautizado: bool | None
    bautismo_mes: int | None
    bautismo_anio: int | None
    talla_camisa: TallaCamisa | None
    talla_otra: str | None
    ticket_path: str | None = Field(exclude=True)
    pago_verificado: bool
    verificado_en: datetime | None
    verificado_por: str | None
    asistio: bool
    asistio_en: datetime | None
    asistio_por: str | None
    created_at: datetime
    equipo: EquipoBrief | None
    equipo_fijado: bool
    es_staff: bool
    registrado_por: str | None

    @computed_field
    @property
    def tiene_comprobante(self) -> bool:
        return self.ticket_path is not None


class CamperListResponse(BaseModel):
    items: list[CamperOut]
    total: int
    page: int
    page_size: int


class CamperUpdate(BaseModel):
    """Payload de PATCH /api/admin/registros/{id} — el modal de edición manda
    siempre el objeto completo (no un parche parcial como AppSettingsUpdate),
    porque los campos condicionales (teléfono, bautismo, promoción, talla
    "otra") necesitan verse todos juntos para poder normalizarse de forma
    coherente, igual que en el registro público (ver validacion_camper.py)."""

    nombre: str = Field(min_length=2, max_length=150)
    iglesia: str = Field(min_length=2, max_length=150)
    edad: int = Field(ge=5, le=99)
    sexo: Sexo
    zona: Zona
    tipo: TipoParticipante
    fecha_pago: date
    tiene_promocion: bool
    telefono: str | None = Field(default=None, max_length=30)
    bautizado: bool | None = None
    bautismo_mes: int | None = Field(default=None, ge=1, le=12)
    bautismo_anio: int | None = Field(default=None, ge=1960)
    promocion_detalle: str | None = Field(default=None, max_length=200)
    talla_camisa: TallaCamisa | None = None
    talla_otra: str | None = Field(default=None, max_length=50)


class RegistroSitioCreate(BaseModel):
    """Payload de POST /api/admin/registros — alta en el campamento. Mismos
    campos que CamperUpdate, pero la fecha de pago y la promoción son opcionales
    (quien paga ahí no tiene transferencia ni promoción) y `forzar` salta el
    aviso de posible duplicado."""

    nombre: str = Field(min_length=2, max_length=150)
    iglesia: str = Field(min_length=2, max_length=150)
    edad: int = Field(ge=5, le=99)
    sexo: Sexo
    zona: Zona
    tipo: TipoParticipante
    fecha_pago: date
    tiene_promocion: bool = False
    telefono: str | None = Field(default=None, max_length=30)
    bautizado: bool | None = None
    bautismo_mes: int | None = Field(default=None, ge=1, le=12)
    bautismo_anio: int | None = Field(default=None, ge=1960)
    promocion_detalle: str | None = Field(default=None, max_length=200)
    talla_camisa: TallaCamisa | None = None
    talla_otra: str | None = Field(default=None, max_length=50)
    forzar: bool = False


class PagoUpdate(BaseModel):
    verificado: bool


class AsistenciaUpdate(BaseModel):
    asistio: bool


class LoginRequest(BaseModel):
    username: str
    password: str


class AdminOut(BaseModel):
    username: str
    role: AdminRole


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: AdminRole
    created_at: datetime


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=200)
    role: AdminRole


class AdminUserUpdate(BaseModel):
    role: AdminRole | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)


class TallaStatsItem(BaseModel):
    talla: TallaCamisa
    total: int
    verificados: int


class TallaStatsResponse(BaseModel):
    items: list[TallaStatsItem]
    sin_talla: int
    total_campers: int


class AppSettingsOut(BaseModel):
    show_shirt_size: bool
    precio_mxn: int
    pedir_comprobante: bool
    registro_abierto: bool
    registro_cierre_en: datetime | None = None


class AppSettingsUpdate(BaseModel):
    """Todos los campos opcionales: el PATCH es parcial — el panel admin tiene
    controles independientes (toggle de camisetas, precio, toggle de
    comprobante, toggle de registro abierto) y cada uno debe poder guardarse
    sin pisar los demás."""

    show_shirt_size: bool | None = None
    precio_mxn: int | None = Field(default=None, ge=0, le=100_000)
    pedir_comprobante: bool | None = None
    registro_abierto: bool | None = None
    registro_cierre_en: datetime | None = None

    @field_validator("registro_cierre_en")
    @classmethod
    def _cierre_en_futuro(cls, v: datetime | None) -> datetime | None:
        if v is None:
            return None  # null explícito = quitar el cierre programado
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        if v <= datetime.now(timezone.utc):
            raise ValueError("La hora de cierre ya pasó.")
        return v


class ComprobanteStatsResponse(BaseModel):
    con_comprobante: int
    sin_comprobante: int


class AsistenciaStatsResponse(BaseModel):
    total: int
    asistieron: int
    faltan: int


# ---- Equipos ----

_HEX_COLOR = r"^#[0-9a-fA-F]{6}$"


class EquipoCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=80)
    color: str = Field(pattern=_HEX_COLOR)


class EquipoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=_HEX_COLOR)
    orden: int | None = None


class EquipoStats(BaseModel):
    total: int
    edad_promedio: float | None
    bautizados: int
    bautismo_meses_promedio: float | None
    hombres: int
    mujeres: int
    consejeros: int
    iglesias_distintas: int


class MiembroOut(BaseModel):
    """Subconjunto ligero de CamperOut para la pantalla de equipos — evita
    mandar los campos de pago/comprobante que esa pantalla no usa."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    edad: int
    sexo: Sexo
    tipo: TipoParticipante | None
    iglesia: str
    zona: Zona | None
    bautizado: bool | None
    bautismo_mes: int | None
    bautismo_anio: int | None
    equipo_fijado: bool
    es_staff: bool


class EquipoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    color: str
    orden: int
    stats: EquipoStats
    miembros: list[MiembroOut]


class DistribucionOut(BaseModel):
    equipos: list[EquipoOut]
    sin_equipo: list[MiembroOut]
    staff: list[MiembroOut]


class EquiposConfig(BaseModel):
    equipos_auto: bool
    eq_balance_edad: bool
    eq_balance_bautismo: bool
    eq_balance_procedencia: bool
    eq_balance_sexo: bool
    eq_balance_tamano: bool


class EquiposConfigUpdate(BaseModel):
    equipos_auto: bool | None = None
    eq_balance_edad: bool | None = None
    eq_balance_bautismo: bool | None = None
    eq_balance_procedencia: bool | None = None
    eq_balance_sexo: bool | None = None
    eq_balance_tamano: bool | None = None


class EquipoAsignacion(BaseModel):
    equipo_id: int | None = None


class StaffUpdate(BaseModel):
    es_staff: bool


class RepartirRequest(BaseModel):
    incluir_fijados: bool = False


# ---- Conciliación de comprobantes ------------------------------------------

class AlertaOut(BaseModel):
    codigo: str
    nivel: str
    texto: str


class ChequeoOut(BaseModel):
    codigo: str
    ok: bool | None
    texto: str


class ComprobanteMiembroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folio: str
    nombre: str
    iglesia: str
    tipo: TipoParticipante | None
    fecha_pago: date | None
    created_at: datetime
    pago_verificado: bool
    tiene_promocion: bool | None
    promocion_detalle: str | None
    ocr_estado: str
    ocr_fuente: str | None
    comp_tipo: str | None
    comp_banco: str | None
    comp_referencia: str | None
    comp_clave_rastreo: str | None
    comp_fecha: date | None
    comp_monto_centavos: int | None
    comp_editado: bool
    comp_revisado: bool
    comp_revisado_por: str | None
    comp_revisado_en: datetime | None
    comp_nota: str | None
    comp_separado: bool


class ConciliacionGrupoOut(BaseModel):
    id: int  # id del primer miembro: identifica al grupo en la UI
    estado: str  # ok | alerta | revisado
    tipo: str | None
    monto_centavos: int | None
    fecha: date | None
    tarifa: int | None
    esperado_centavos: int | None
    cubre: int | None
    por_que_juntos: list[str]
    alertas: list[AlertaOut]
    chequeos: list[ChequeoOut]
    clase: str  # individual | grupal
    separado: bool
    miembros: list[ComprobanteMiembroOut]


class ConciliacionResumen(BaseModel):
    con_comprobante: int
    sin_comprobante: int
    leidos: int
    sin_leer: int
    grupos: int
    grupos_con_alerta: int
    grupos_compartidos: int
    grupos_revisados: int
    verificados_individuales: int
    verificados_grupales: int
    dinero_leido_centavos: int
    dinero_esperado_centavos: int
    lector: str  # "gemini" | "local"


class ConciliacionResponse(BaseModel):
    resumen: ConciliacionResumen
    grupos: list[ConciliacionGrupoOut]


class ComprobanteUpdate(BaseModel):
    comp_tipo: str | None = Field(default=None, max_length=30)
    comp_banco: str | None = Field(default=None, max_length=60)
    comp_referencia: str | None = Field(default=None, max_length=80)
    comp_clave_rastreo: str | None = Field(default=None, max_length=80)
    comp_fecha: date | None = None
    monto_pesos: float | None = Field(default=None, ge=0, le=1_000_000)


class RevisadoUpdate(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=50)
    revisado: bool
    nota: str | None = Field(default=None, max_length=300)


class AprobarUpdate(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=50)
    nota: str | None = Field(default=None, max_length=300)


class SepararUpdate(BaseModel):
    separado: bool


class EventoOut(BaseModel):
    id: int
    camper_id: int
    folio: str
    nombre: str
    creado_en: datetime
    usuario: str
    accion: str
    detalle: dict | None


class ProcesarEstadoOut(BaseModel):
    corriendo: bool
    total: int
    hechos: int
    con_gemini: bool
    error: str | None


# ---- Juegos (calificaciones de los jueces) ----------------------------------
class CriterioOut(BaseModel):
    clave: str
    nombre: str
    descripcion: str
    tipo: str  # "escala" | "si_no"
    puntos: int
    escala_max: int


class EstacionOut(BaseModel):
    """Una estación de un juego en modo `estaciones` (rally / búsqueda): lo que el frontend necesita
    para dibujar su hoja de captura."""

    clave: str
    nombre: str
    tipo: str  # "rally" | "busqueda" | "capilla"
    subtitulo: str
    limite_seg: int
    avance: str | None  # "nivel" | "conteo" | "son_logro" | "lados"
    etiqueta_avance: str
    total_sugerido: int | None
    orden_equipos: list[str]
    puntos_max: int


class JuegoOut(BaseModel):
    clave: str
    nombre: str
    descripcion: str
    puntos_max: int
    modo: str  # "jueces" | "estaciones"
    criterios: list[CriterioOut]
    estaciones: list[EstacionOut]


class HojaCreate(BaseModel):
    equipo_id: int
    juez: str = Field(min_length=1, max_length=80)
    # {criterio: 0..100 (escala) | true/false (si_no)}; juegos.validar_valores lo revisa a fondo.
    valores: dict[str, int | bool]


class HojaUpdate(BaseModel):
    equipo_id: int | None = None
    juez: str | None = Field(default=None, min_length=1, max_length=80)
    valores: dict[str, int | bool] | None = None


class FilaEstacion(BaseModel):
    """Un renglón de la hoja de una estación: lo que marcó el encargado para un equipo."""

    equipo_id: int
    # La forma depende del tipo de estación (listas, "F"/"D"…); juegos.validar_fila lo revisa a fondo.
    valores: dict[str, Any]


class HojaEstacionPut(BaseModel):
    """La hoja completa de una estación (todos los renglones que tienen datos)."""

    filas: list[FilaEstacion] = Field(max_length=50)


class HojaOut(BaseModel):
    id: int
    juego: str
    equipo_id: int
    juez: str  # modo estaciones: la clave de la estación
    valores: dict[str, Any]
    puntos: dict[str, float]
    total: float
    creado_en: datetime
    creado_por: str
    actualizado_en: datetime | None
    actualizado_por: str | None


PUNTOS_EXTRA_MAX = 10_000


class PuntosExtraCreate(BaseModel):
    """Puntos extra (+) o descuento (−) para un equipo. `juego` = clave del juego, o `None` = general."""

    equipo_id: int
    juego: str | None = Field(default=None, max_length=40)
    puntos: int = Field(ge=-PUNTOS_EXTRA_MAX, le=PUNTOS_EXTRA_MAX)
    motivo: str = Field(min_length=1, max_length=200)

    @field_validator("puntos")
    @classmethod
    def _puntos_no_cero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("Escribe cuántos puntos sumar o quitar (no puede ser 0).")
        return v

    @field_validator("motivo")
    @classmethod
    def _motivo_limpio(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Escribe el motivo.")
        return v


class PuntosExtraUpdate(BaseModel):
    equipo_id: int | None = None
    juego: str | None = Field(default=None, max_length=40)  # con `exclude_unset`, null explícito = pasar a general
    puntos: int | None = Field(default=None, ge=-PUNTOS_EXTRA_MAX, le=PUNTOS_EXTRA_MAX)
    motivo: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("puntos")
    @classmethod
    def _puntos_no_cero(cls, v: int | None) -> int | None:
        if v == 0:
            raise ValueError("Escribe cuántos puntos sumar o quitar (no puede ser 0).")
        return v

    @field_validator("motivo")
    @classmethod
    def _motivo_limpio(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = " ".join(v.split())
        if not v:
            raise ValueError("Escribe el motivo.")
        return v


class PuntosExtraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipo_id: int
    juego: str | None
    puntos: int
    motivo: str
    creado_en: datetime
    creado_por: str
    actualizado_en: datetime | None
    actualizado_por: str | None


class ResultadoEquipoOut(BaseModel):
    equipo_id: int
    nombre: str
    color: str
    hojas: int
    por_criterio: dict[str, float]
    extra: float = 0  # puntos extra/descuentos de este juego, ya incluidos en `total`
    total: float
    posicion: int | None
    tiempo_seg: int | None = None  # modo estaciones: tiempo que cuenta para el desempate


class EquipoRefOut(BaseModel):
    """Un equipo dentro del torneo: lo mínimo para pintar su chip."""

    id: int
    nombre: str
    color: str


class PartidoOut(BaseModel):
    slot: str  # r1-1 … r2-5 · tercero · final
    ronda: str  # "r1" | "r2" | "tercero" | "final"
    etiqueta: str  # «Ronda 1 · Partido 2», «Tercer lugar», «Gran final»
    a: EquipoRefOut
    b: EquipoRefOut
    pa: int | None
    pb: int | None
    termino: str | None  # "normal" | "tope" | "siguiente_punto" | "volado"
    jugado: bool
    saltado: bool
    ganador_id: int | None
    estado: str  # "jugado" | "en_cancha" | "proximo" | "pendiente" | "saltado"


class FilaTablaOut(BaseModel):
    equipo: EquipoRefOut
    lugar: int
    jugados: int
    victorias: int
    f: int
    c: int
    dif: int
    empate: bool  # sigue empatado: falta el volado
    por_volado: bool  # el orden lo decidió un desempate


class EmpateOut(BaseModel):
    ronda: str  # "r1" | "r2"
    equipos: list[EquipoRefOut]
    primero: int
    ultimo: int
    tipo: str  # "volado" | "punto_oro"
    bloquea: bool


class PropuestaPartidoOut(BaseModel):
    slot: str
    etiqueta: str
    a: EquipoRefOut
    b: EquipoRefOut


class PropuestaOut(BaseModel):
    tipo: str  # "ronda2" | "finales"
    partidos: list[PropuestaPartidoOut]
    cambios: list[str]  # «Sequoias y Acacias ya jugaron en la ronda 1: Sequoias se cambia con Ahuehuetes.»
    ajustada: bool
    con_revancha: bool


class LugarFinalOut(BaseModel):
    equipo: EquipoRefOut
    lugar: int
    puntos: int
    origen: str  # "final" | "tercero" | "tabla"


class SiguienteOut(BaseModel):
    accion: str  # sortear | sin_equipos | capturar | desempatar | armar_ronda2 | armar_finales | terminado
    faltan: int
    en_cancha: str | None
    proximo: str | None


class TorneoOut(BaseModel):
    fase: str  # sin_sorteo | ronda1 | ronda2 | finales | terminado
    definitivo: bool  # los puntos ya cuentan en el marcador general
    n_equipos: int
    partidos: list[PartidoOut]
    tabla_r1: list[FilaTablaOut] | None
    tabla_r2: list[FilaTablaOut] | None
    empates: list[EmpateOut]
    siguiente: SiguienteOut
    propuesta: PropuestaOut | None
    lugares: list[LugarFinalOut] | None  # provisional mientras no `definitivo`
    tercero_saltado: bool
    hay_marcadores: bool  # si hay alguno, ya no se puede volver a sortear
    avisos: list[str]


class MarcadorPut(BaseModel):
    """Marcador de un partido, o `limpiar=True` para dejarlo sin jugar. `voleibol.validar_marcador` lo revisa a fondo."""

    pa: int | None = None
    pb: int | None = None
    termino: str | None = None
    limpiar: bool = False


class DesempatePost(BaseModel):
    """Resuelve un empate exacto. Sin `orden` la app hace el volado al azar; con `orden` (ids de `equipos`,
    el que gana primero) se registra lo que se decidió en la cancha."""

    ronda: str = Field(pattern="^(r1|r2)$")
    equipos: list[int] = Field(min_length=2, max_length=30)
    orden: list[int] | None = Field(default=None, max_length=30)


class JuegoDetalleOut(BaseModel):
    juego: JuegoOut
    equipos: list[ResultadoEquipoOut]
    hojas: list[HojaOut]
    puntos_extra: list[PuntosExtraOut] = []  # solo los de este juego
    torneo: TorneoOut | None = None  # solo en modo `torneo`


class PosicionOut(BaseModel):
    equipo_id: int
    nombre: str
    color: str
    por_juego: dict[str, float | None]
    posicion_por_juego: dict[str, int | None] = {}
    extra: float = 0  # puntos extra generales (sin juego), ya incluidos en `total`
    total: float
    posicion: int | None


class PosicionesOut(BaseModel):
    juegos: list[JuegoOut]
    equipos: list[PosicionOut]
    puntos_extra: list[PuntosExtraOut] = []  # todos, generales y de cada juego
