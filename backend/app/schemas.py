from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

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

    @computed_field
    @property
    def tiene_comprobante(self) -> bool:
        return self.ticket_path is not None


class CamperListResponse(BaseModel):
    items: list[CamperOut]
    total: int
    page: int
    page_size: int


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


class AppSettingsUpdate(BaseModel):
    """Todos los campos opcionales: el PATCH es parcial — el panel admin tiene
    controles independientes (toggle de camisetas, precio, toggle de
    comprobante, toggle de registro abierto) y cada uno debe poder guardarse
    sin pisar los demás."""

    show_shirt_size: bool | None = None
    precio_mxn: int | None = Field(default=None, ge=0, le=100_000)
    pedir_comprobante: bool | None = None
    registro_abierto: bool | None = None


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


class RepartirRequest(BaseModel):
    incluir_fijados: bool = False
