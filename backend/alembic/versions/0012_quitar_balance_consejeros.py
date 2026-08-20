"""quitar eq_balance_consejeros: los consejeros ya no se auto-asignan a un equipo

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        op.drop_column("app_settings", "eq_balance_consejeros")
    else:
        with op.batch_alter_table("app_settings") as batch_op:
            batch_op.drop_column("eq_balance_consejeros")


def downgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column("eq_balance_consejeros", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
