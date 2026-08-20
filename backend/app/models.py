import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _short_folio() -> str:
    return f"ARR-{uuid.uuid4().hex[:6].upper()}"


class Sexo(str, enum.Enum):
    MASCULINO = "M"
    FEMENINO = "F"


class TallaCamisa(str, enum.Enum):
    XCH = "XCH"
    CH = "CH"
    M = "M"
    G = "G"
    XG = "XG"
    OTRA = "OTRA"


class Zona(str, enum.Enum):
    VALLES = "VALLES"
    VICTORIA = "VICTORIA"
    MANTE = "MANTE"
    METRO = "METRO"
    OTRO = "OTRO"


class TipoParticipante(str, enum.Enum):
    CAMPERO = "CAMPERO"
    CONSEJERO = "CONSEJERO"


class AdminRole(str, enum.Enum):
    ADMIN = "ADMIN"
    VERIFICADOR_PAGO = "VERIFICADOR_PAGO"
    VISUALIZADOR = "VISUALIZADOR"
    RECEPCION = "RECEPCION"


class Camper(Base):
    __tablename__ = "campers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    folio: Mapped[str] = mapped_column(String(20), unique=True, index=True, default=_short_folio)
    nombre: Mapped[str] = mapped_column(String(150))
    ciudad: Mapped[str | None] = mapped_column(String(100), nullable=True)
    iglesia: Mapped[str] = mapped_column(String(150))
    edad: Mapped[int] = mapped_column(Integer)
    sexo: Mapped[Sexo] = mapped_column(Enum(Sexo, name="sexo_enum"))
    zona: Mapped[Zona | None] = mapped_column(Enum(Zona, name="zona_enum"), nullable=True)
    tipo: Mapped[TipoParticipante | None] = mapped_column(
        Enum(TipoParticipante, name="tipo_participante_enum"), nullable=True
    )
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    fecha_pago: Mapped[date | None] = mapped_column(Date, nullable=True)
    tiene_promocion: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    promocion_detalle: Mapped[str | None] = mapped_column(String(200), nullable=True)
    bautizado: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    bautismo_mes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bautismo_anio: Mapped[int | None] = mapped_column(Integer, nullable=True)
    talla_camisa: Mapped[TallaCamisa | None] = mapped_column(
        Enum(TallaCamisa, name="talla_camisa_enum"), nullable=True
    )
    talla_otra: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ticket_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ticket_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pago_verificado: Mapped[bool] = mapped_column(Boolean, default=False)
    verificado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verificado_por: Mapped[str | None] = mapped_column(String(100), nullable=True)
    asistio: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    asistio_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    asistio_por: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    equipo_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # True cuando un admin movió a esta persona a mano desde /admin/equipos —
    # "Repartir a todos" respeta a los fijados por defecto para no deshacer
    # silenciosamente un ajuste manual (ver equipos_balance.repartir()).
    equipo_fijado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    equipo: Mapped["Equipo | None"] = relationship(back_populates="miembros")


class Equipo(Base):
    """Equipo de campamento — creado desde /admin/equipos. El reparto
    balanceado entre equipos vive en equipos_balance.py, no aquí; este
    modelo es solo el contenedor (nombre, color, orden de despliegue)."""

    __tablename__ = "equipos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    color: Mapped[str] = mapped_column(String(7))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    miembros: Mapped[list["Camper"]] = relationship(back_populates="equipo", passive_deletes=True)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[AdminRole] = mapped_column(Enum(AdminRole, name="admin_role_enum"), default=AdminRole.ADMIN)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AppSettings(Base):
    """Fila única (id=1) de interruptores editables desde el panel admin sin
    tocar código ni redeploy — `show_shirt_size`, `precio_mxn`,
    `pedir_comprobante` y `registro_abierto`. sembrada en el arranque por
    seed_settings() en main.py, igual que seed_admin().

    Los seis campos `equipos_*`/`eq_balance_*` siguen el mismo patrón de
    almacenamiento pero son una excepción deliberada al resto de esta clase:
    no se exponen en `AppSettingsOut`/`GET /api/settings` (público) porque el
    formulario de registro no los necesita — se leen/escriben solo desde
    `GET/PATCH /api/admin/equipos/config`. No hay `eq_balance_consejeros`:
    los consejeros nunca se auto-asignan a un equipo (ver equipos_balance.py),
    así que no hay nada de "consejeros repartidos" que apagar/prender."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    show_shirt_size: Mapped[bool] = mapped_column(Boolean, default=False)
    precio_mxn: Mapped[int] = mapped_column(Integer, default=350)
    pedir_comprobante: Mapped[bool] = mapped_column(Boolean, default=True)
    registro_abierto: Mapped[bool] = mapped_column(Boolean, default=True)
    equipos_auto: Mapped[bool] = mapped_column(Boolean, default=True)
    eq_balance_edad: Mapped[bool] = mapped_column(Boolean, default=True)
    eq_balance_bautismo: Mapped[bool] = mapped_column(Boolean, default=True)
    eq_balance_procedencia: Mapped[bool] = mapped_column(Boolean, default=True)
    eq_balance_sexo: Mapped[bool] = mapped_column(Boolean, default=True)
    eq_balance_tamano: Mapped[bool] = mapped_column(Boolean, default=True)
