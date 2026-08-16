"""admin roles

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    admin_role_enum = sa.Enum("ADMIN", "VERIFICADOR_PAGO", "VISUALIZADOR", name="admin_role_enum")
    admin_role_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "admin_users",
        sa.Column("role", admin_role_enum, nullable=False, server_default="ADMIN"),
    )


def downgrade() -> None:
    op.drop_column("admin_users", "role")
    sa.Enum(name="admin_role_enum").drop(op.get_bind(), checkfirst=True)
