"""tipo de participante (campero / consejero) + telefono

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    tipo_enum = sa.Enum("CAMPERO", "CONSEJERO", name="tipo_participante_enum")
    tipo_enum.create(bind, checkfirst=True)

    op.add_column("campers", sa.Column("tipo", tipo_enum, nullable=True))
    op.add_column("campers", sa.Column("telefono", sa.String(length=30), nullable=True))

    # Todos los registros previos a este cambio son camperos — no había otra
    # opción en el formulario.
    tipo_cast = "::tipo_participante_enum" if is_pg else ""
    op.execute(f"UPDATE campers SET tipo = 'CAMPERO'{tipo_cast} WHERE tipo IS NULL")


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        op.drop_column("campers", "telefono")
        op.drop_column("campers", "tipo")
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.drop_column("telefono")
            batch_op.drop_column("tipo")

    sa.Enum(name="tipo_participante_enum").drop(bind, checkfirst=True)
