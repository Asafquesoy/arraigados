from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from .models import AdminRole, Sexo, TallaCamisa, Zona


class CamperCreateResponse(BaseModel):
    folio: str
    nombre: str


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
    fecha_pago: date | None
    tiene_promocion: bool | None
    promocion_detalle: str | None
    bautizado: bool | None
    fecha_bautismo: str | None
    talla_camisa: TallaCamisa | None
    talla_otra: str | None
    ticket_path: str | None = Field(exclude=True)
    pago_verificado: bool
    verificado_en: datetime | None
    verificado_por: str | None
    created_at: datetime

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
