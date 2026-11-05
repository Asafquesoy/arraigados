"""campers: datos leídos del comprobante (monto, fecha, referencia) y huellas de la imagen

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNAS = [
    sa.Column("ticket_sha256", sa.String(64), nullable=True),
    sa.Column("ticket_phash", sa.String(32), nullable=True),
    sa.Column("ocr_estado", sa.String(20), nullable=False, server_default="PENDIENTE"),
    sa.Column("ocr_fuente", sa.String(20), nullable=True),
    sa.Column("ocr_texto", sa.Text(), nullable=True),
    sa.Column("comp_tipo", sa.String(30), nullable=True),
    sa.Column("comp_banco", sa.String(60), nullable=True),
    sa.Column("comp_referencia", sa.String(80), nullable=True),
    sa.Column("comp_clave_rastreo", sa.String(80), nullable=True),
    sa.Column("comp_fecha", sa.Date(), nullable=True),
    sa.Column("comp_monto_centavos", sa.Integer(), nullable=True),
    sa.Column("comp_editado", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("comp_revisado", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("comp_revisado_en", sa.DateTime(timezone=True), nullable=True),
    sa.Column("comp_revisado_por", sa.String(100), nullable=True),
    sa.Column("comp_nota", sa.String(300), nullable=True),
]


def upgrade() -> None:
    for col in _COLUMNAS:
        op.add_column("campers", col)
    op.create_index("ix_campers_ticket_sha256", "campers", ["ticket_sha256"])


def downgrade() -> None:
    op.drop_index("ix_campers_ticket_sha256", table_name="campers")
    with op.batch_alter_table("campers") as batch_op:
        for col in reversed(_COLUMNAS):
            batch_op.drop_column(col.name)
