"""comprobante de pago opcional (toggle admin + columnas nullable)

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.add_column(
        "app_settings",
        sa.Column("pedir_comprobante", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    if is_pg:
        op.alter_column("campers", "ticket_path", existing_type=sa.String(length=255), nullable=True)
        op.alter_column("campers", "ticket_mime", existing_type=sa.String(length=100), nullable=True)
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.alter_column("ticket_path", existing_type=sa.String(length=255), nullable=True)
            batch_op.alter_column("ticket_mime", existing_type=sa.String(length=100), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # No hay forma de reconstruir un comprobante real para registros que se
    # guardaron sin uno — se rellena un placeholder vacío solo para poder
    # restaurar el NOT NULL, igual que el patrón de "Sin especificar" en 0005.
    op.execute("UPDATE campers SET ticket_path = '' WHERE ticket_path IS NULL")
    op.execute("UPDATE campers SET ticket_mime = '' WHERE ticket_mime IS NULL")

    if is_pg:
        op.alter_column("campers", "ticket_path", existing_type=sa.String(length=255), nullable=False)
        op.alter_column("campers", "ticket_mime", existing_type=sa.String(length=100), nullable=False)
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.alter_column("ticket_path", existing_type=sa.String(length=255), nullable=False)
            batch_op.alter_column("ticket_mime", existing_type=sa.String(length=100), nullable=False)

    op.drop_column("app_settings", "pedir_comprobante")
