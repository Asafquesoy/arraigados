import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _short_folio() -> str:
    return f"ARR-{uuid.uuid4().hex[:6].upper()}"


class Sexo(str, enum.Enum):
    MASCULINO = "M"
    FEMENINO = "F"


class TallaCamisa(str, enum.Enum):
    XS = "XS"
    S = "S"
    M = "M"
    L = "L"
    XL = "XL"
    XXL = "XXL"


class Camper(Base):
    __tablename__ = "campers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    folio: Mapped[str] = mapped_column(String(20), unique=True, index=True, default=_short_folio)
    nombre: Mapped[str] = mapped_column(String(150))
    ciudad: Mapped[str] = mapped_column(String(100))
    iglesia: Mapped[str] = mapped_column(String(150))
    edad: Mapped[int] = mapped_column(Integer)
    sexo: Mapped[Sexo] = mapped_column(Enum(Sexo, name="sexo_enum"))
    talla_camisa: Mapped[TallaCamisa | None] = mapped_column(
        Enum(TallaCamisa, name="talla_camisa_enum"), nullable=True
    )
    ticket_path: Mapped[str] = mapped_column(String(255))
    ticket_mime: Mapped[str] = mapped_column(String(100))
    pago_verificado: Mapped[bool] = mapped_column(Boolean, default=False)
    verificado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verificado_por: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
