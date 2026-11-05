"""historial de la conciliación (comprobante_eventos) y campers.comp_separado

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("campers", sa.Column("comp_separado", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "comprobante_eventos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("camper_id", sa.Integer(), sa.ForeignKey("campers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usuario", sa.String(100), nullable=False),
        sa.Column("accion", sa.String(30), nullable=False),
        sa.Column("detalle", sa.Text(), nullable=True),
    )
    op.create_index("ix_comprobante_eventos_camper_id", "comprobante_eventos", ["camper_id"])


def downgrade() -> None:
    op.drop_index("ix_comprobante_eventos_camper_id", table_name="comprobante_eventos")
    op.drop_table("comprobante_eventos")
    with op.batch_alter_table("campers") as batch_op:
        batch_op.drop_column("comp_separado")
