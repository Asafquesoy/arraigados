"""app settings

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("show_shirt_size", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # La fila id=1 la crea seed_settings() en main.py al arrancar (mismo
    # patrón que seed_admin()) — no se inserta aquí para no duplicar esa
    # lógica en dos lugares.


def downgrade() -> None:
    op.drop_table("app_settings")
