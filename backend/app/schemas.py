from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import Sexo, TallaCamisa


class CamperCreateResponse(BaseModel):
    folio: str
    nombre: str


class CamperOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folio: str
    nombre: str
    ciudad: str
    iglesia: str
    edad: int
    sexo: Sexo
    talla_camisa: TallaCamisa | None
    pago_verificado: bool
    verificado_en: datetime | None
    verificado_por: str | None
    created_at: datetime


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
