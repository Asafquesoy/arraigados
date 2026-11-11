"""calificaciones de los juegos por equipo (hojas de los jueces)

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calificaciones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("juego", sa.String(40), nullable=False),
        sa.Column("equipo_id", sa.Integer(), sa.ForeignKey("equipos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("juez", sa.String(80), nullable=False),
        sa.Column("valores", sa.JSON(), nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("creado_por", sa.String(100), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actualizado_por", sa.String(100), nullable=True),
        sa.UniqueConstraint("juego", "equipo_id", "juez", name="uq_calificaciones_juego_equipo_juez"),
    )
    op.create_index("ix_calificaciones_juego", "calificaciones", ["juego"])
    op.create_index("ix_calificaciones_equipo_id", "calificaciones", ["equipo_id"])


def downgrade() -> None:
    op.drop_index("ix_calificaciones_equipo_id", table_name="calificaciones")
    op.drop_index("ix_calificaciones_juego", table_name="calificaciones")
    op.drop_table("calificaciones")
