"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sexo_enum = sa.Enum("MASCULINO", "FEMENINO", name="sexo_enum")
    talla_enum = sa.Enum("XS", "S", "M", "L", "XL", "XXL", name="talla_camisa_enum")
    sexo_enum.create(op.get_bind(), checkfirst=True)
    talla_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "admin_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=100), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_admin_users_username", "admin_users", ["username"])

    op.create_table(
        "campers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("folio", sa.String(length=20), nullable=False, unique=True),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("ciudad", sa.String(length=100), nullable=False),
        sa.Column("iglesia", sa.String(length=150), nullable=False),
        sa.Column("edad", sa.Integer(), nullable=False),
        sa.Column("sexo", sexo_enum, nullable=False),
        sa.Column("talla_camisa", talla_enum, nullable=True),
        sa.Column("ticket_path", sa.String(length=255), nullable=False),
        sa.Column("ticket_mime", sa.String(length=100), nullable=False),
        sa.Column("pago_verificado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verificado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verificado_por", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_campers_folio", "campers", ["folio"])


def downgrade() -> None:
    op.drop_index("ix_campers_folio", table_name="campers")
    op.drop_table("campers")
    op.drop_index("ix_admin_users_username", table_name="admin_users")
    op.drop_table("admin_users")
    sa.Enum(name="talla_camisa_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="sexo_enum").drop(op.get_bind(), checkfirst=True)
