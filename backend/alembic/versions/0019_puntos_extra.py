"""puntos extra y descuentos por equipo (con motivo)

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "puntos_extra",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("equipo_id", sa.Integer(), sa.ForeignKey("equipos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("juego", sa.String(40), nullable=True),
        sa.Column("puntos", sa.Integer(), nullable=False),
        sa.Column("motivo", sa.String(200), nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("creado_por", sa.String(100), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actualizado_por", sa.String(100), nullable=True),
    )
    op.create_index("ix_puntos_extra_equipo_id", "puntos_extra", ["equipo_id"])
    op.create_index("ix_puntos_extra_juego", "puntos_extra", ["juego"])


def downgrade() -> None:
    op.drop_index("ix_puntos_extra_juego", table_name="puntos_extra")
    op.drop_index("ix_puntos_extra_equipo_id", table_name="puntos_extra")
    op.drop_table("puntos_extra")
