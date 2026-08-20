"""equipos: tabla nueva + columnas de asignación en campers + config de reparto

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONFIG_COLUMNS = (
    "equipos_auto",
    "eq_balance_edad",
    "eq_balance_bautismo",
    "eq_balance_procedencia",
    "eq_balance_sexo",
    "eq_balance_tamano",
    "eq_balance_consejeros",
)


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.create_table(
        "equipos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(length=80), nullable=False, unique=True),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_equipos_nombre", "equipos", ["nombre"])

    op.add_column("campers", sa.Column("equipo_id", sa.Integer(), nullable=True))
    op.create_index("ix_campers_equipo_id", "campers", ["equipo_id"])
    op.add_column(
        "campers", sa.Column("equipo_fijado", sa.Boolean(), nullable=False, server_default=sa.false())
    )

    # SQLite no admite agregar una FK con ALTER TABLE — la columna suelta
    # basta en dev (sin integridad referencial forzada); en Postgres sí se
    # declara, con ON DELETE SET NULL para que borrar un equipo libere a sus
    # miembros en vez de fallar o arrastrarlos consigo.
    if is_pg:
        op.create_foreign_key(
            "fk_campers_equipo_id_equipos",
            "campers",
            "equipos",
            ["equipo_id"],
            ["id"],
            ondelete="SET NULL",
        )

    for column in _CONFIG_COLUMNS:
        op.add_column(
            "app_settings", sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.true())
        )


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        for column in _CONFIG_COLUMNS:
            op.drop_column("app_settings", column)
        op.drop_constraint("fk_campers_equipo_id_equipos", "campers", type_="foreignkey")
        op.drop_index("ix_campers_equipo_id", table_name="campers")
        op.drop_column("campers", "equipo_fijado")
        op.drop_column("campers", "equipo_id")
    else:
        with op.batch_alter_table("app_settings") as batch_op:
            for column in _CONFIG_COLUMNS:
                batch_op.drop_column(column)
        with op.batch_alter_table("campers") as batch_op:
            batch_op.drop_index("ix_campers_equipo_id")
            batch_op.drop_column("equipo_fijado")
            batch_op.drop_column("equipo_id")

    op.drop_index("ix_equipos_nombre", table_name="equipos")
    op.drop_table("equipos")
