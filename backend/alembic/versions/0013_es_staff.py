"""campers.es_staff: marca a quien es staff para que nunca entre a un equipo

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default=false: los registros que ya existen quedan como no-staff.
    op.add_column(
        "campers",
        sa.Column("es_staff", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_column("campers", "es_staff")
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.drop_column("es_staff")
