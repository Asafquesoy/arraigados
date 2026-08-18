"""fecha de bautismo: texto libre -> mes + año

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.add_column("campers", sa.Column("bautismo_mes", sa.Integer(), nullable=True))
    op.add_column("campers", sa.Column("bautismo_anio", sa.Integer(), nullable=True))

    if is_pg:
        op.drop_column("campers", "fecha_bautismo")
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.drop_column("fecha_bautismo")


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.add_column("campers", sa.Column("fecha_bautismo", sa.String(length=100), nullable=True))

    if is_pg:
        op.drop_column("campers", "bautismo_anio")
        op.drop_column("campers", "bautismo_mes")
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.drop_column("bautismo_anio")
            batch_op.drop_column("bautismo_mes")
