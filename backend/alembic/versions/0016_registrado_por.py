"""campers.registrado_por: quién dio de alta a la persona en el campamento

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Null = se registró sola por el formulario público; con valor = la dio de
    # alta esa cuenta desde /admin/registro-sitio.
    op.add_column("campers", sa.Column("registrado_por", sa.String(length=100), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_column("campers", "registrado_por")
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.drop_column("registrado_por")
