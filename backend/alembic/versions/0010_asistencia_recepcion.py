"""check-in de recepcion (asistencia) + rol RECEPCION

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # SQLite no crea un CHECK constraint para sa.Enum (así quedó desde
    # 0002_admin_roles.py) — admin_role_enum ahí es solo un VARCHAR, así que
    # no hace falta tocar nada para aceptar el nuevo valor. En PostgreSQL el
    # enum es un tipo nativo y sí requiere agregarle el valor explícitamente.
    if is_pg:
        op.execute("ALTER TYPE admin_role_enum ADD VALUE IF NOT EXISTS 'RECEPCION'")

    op.add_column(
        "campers", sa.Column("asistio", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column("campers", sa.Column("asistio_en", sa.DateTime(timezone=True), nullable=True))
    op.add_column("campers", sa.Column("asistio_por", sa.String(length=100), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        op.drop_column("campers", "asistio_por")
        op.drop_column("campers", "asistio_en")
        op.drop_column("campers", "asistio")
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.drop_column("asistio_por")
            batch_op.drop_column("asistio_en")
            batch_op.drop_column("asistio")

    # No es posible quitar un valor de un enum nativo de PostgreSQL sin
    # recrear el tipo por completo; se deja 'RECEPCION' en admin_role_enum
    # como es práctica estándar de Alembic con enums nativos (igual criterio
    # que ya aceptó este proyecto para otros enums que no revierten valores).
