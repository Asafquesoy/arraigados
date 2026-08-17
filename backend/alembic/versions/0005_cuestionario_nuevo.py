"""cuestionario nuevo (zona, pago, promocion, bautismo, tallas ES)

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_TALLAS = ["XS", "S", "M", "L", "XL", "XXL"]
NEW_TALLAS = ["XCH", "CH", "M", "G", "XG", "OTRA"]
OLD_TO_NEW = dict(zip(OLD_TALLAS, NEW_TALLAS))
NEW_TO_OLD = dict(zip(NEW_TALLAS, OLD_TALLAS))


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    zona_enum = sa.Enum("VALLES", "VICTORIA", "MANTE", "METRO", "OTRO", name="zona_enum")
    zona_enum.create(bind, checkfirst=True)

    op.add_column("campers", sa.Column("zona", zona_enum, nullable=True))
    op.add_column("campers", sa.Column("fecha_pago", sa.Date(), nullable=True))
    op.add_column("campers", sa.Column("tiene_promocion", sa.Boolean(), nullable=True))
    op.add_column("campers", sa.Column("promocion_detalle", sa.String(length=200), nullable=True))
    op.add_column("campers", sa.Column("bautizado", sa.Boolean(), nullable=True))
    op.add_column("campers", sa.Column("fecha_bautismo", sa.String(length=100), nullable=True))
    op.add_column("campers", sa.Column("talla_otra", sa.String(length=50), nullable=True))

    # Backfill zona a partir de ciudad con una heurística simple — no hay mejor
    # fuente para los registros ya capturados con el formulario anterior.
    zona_cast = "::zona_enum" if is_pg else ""
    op.execute(
        f"""
        UPDATE campers SET zona = (CASE
            WHEN LOWER(ciudad) LIKE '%tampico%' OR LOWER(ciudad) LIKE '%madero%'
                 OR LOWER(ciudad) LIKE '%altamira%' THEN 'METRO'
            WHEN LOWER(ciudad) LIKE '%victoria%' THEN 'VICTORIA'
            WHEN LOWER(ciudad) LIKE '%mante%' THEN 'MANTE'
            WHEN LOWER(ciudad) LIKE '%valles%' THEN 'VALLES'
            ELSE 'OTRO'
        END){zona_cast}
        """
    )

    # --- Conversión de talla_camisa a la nomenclatura en español ---
    # 1) Quitar la restricción de enum viejo para poder escribir los valores nuevos.
    old_talla_enum = sa.Enum(*OLD_TALLAS, name="talla_camisa_enum")
    new_talla_enum = sa.Enum(*NEW_TALLAS, name="talla_camisa_enum")

    if is_pg:
        op.execute("ALTER TABLE campers ALTER COLUMN talla_camisa TYPE VARCHAR(10) USING talla_camisa::text")
        old_talla_enum.drop(bind, checkfirst=True)
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.alter_column(
                "talla_camisa", existing_type=old_talla_enum, type_=sa.String(length=10)
            )

    # 2) XXL ya no existe: se vuelve "OTRA" + se guarda el texto libre.
    op.execute("UPDATE campers SET talla_otra = 'XXL' WHERE talla_camisa = 'XXL'")

    # 3) Remapear los valores.
    case_sql = " ".join(f"WHEN '{old}' THEN '{new}'" for old, new in OLD_TO_NEW.items())
    op.execute(f"UPDATE campers SET talla_camisa = CASE talla_camisa {case_sql} ELSE talla_camisa END")

    # 4) Volver a aplicar el enum, ya con los valores nuevos, y aflojar ciudad.
    if is_pg:
        new_talla_enum.create(bind, checkfirst=True)
        op.execute(
            "ALTER TABLE campers ALTER COLUMN talla_camisa TYPE talla_camisa_enum "
            "USING talla_camisa::talla_camisa_enum"
        )
        op.alter_column("campers", "ciudad", existing_type=sa.String(length=100), nullable=True)
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.alter_column(
                "talla_camisa", existing_type=sa.String(length=10), type_=new_talla_enum
            )
            batch_op.alter_column("ciudad", existing_type=sa.String(length=100), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    old_talla_enum = sa.Enum(*OLD_TALLAS, name="talla_camisa_enum")
    new_talla_enum = sa.Enum(*NEW_TALLAS, name="talla_camisa_enum")

    # Restaurar ciudad NOT NULL: los registros nuevos que no la tengan reciben un
    # placeholder — no hay forma de reconstruir el dato original a partir de zona.
    op.execute("UPDATE campers SET ciudad = 'Sin especificar' WHERE ciudad IS NULL")

    if is_pg:
        op.alter_column("campers", "ciudad", existing_type=sa.String(length=100), nullable=False)
        op.execute("ALTER TABLE campers ALTER COLUMN talla_camisa TYPE VARCHAR(10) USING talla_camisa::text")
        new_talla_enum.drop(bind, checkfirst=True)
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.alter_column("ciudad", existing_type=sa.String(length=100), nullable=False)
            batch_op.alter_column(
                "talla_camisa", existing_type=new_talla_enum, type_=sa.String(length=10)
            )

    op.execute("UPDATE campers SET talla_camisa = 'XXL' WHERE talla_otra IS NOT NULL AND talla_camisa = 'OTRA'")
    case_sql = " ".join(f"WHEN '{new}' THEN '{old}'" for old, new in OLD_TO_NEW.items())
    op.execute(f"UPDATE campers SET talla_camisa = CASE talla_camisa {case_sql} ELSE talla_camisa END")

    if is_pg:
        old_talla_enum.create(bind, checkfirst=True)
        op.execute(
            "ALTER TABLE campers ALTER COLUMN talla_camisa TYPE talla_camisa_enum "
            "USING talla_camisa::talla_camisa_enum"
        )
    else:
        with op.batch_alter_table("campers") as batch_op:
            batch_op.alter_column(
                "talla_camisa", existing_type=sa.String(length=10), type_=old_talla_enum
            )

    op.drop_column("campers", "talla_otra")
    op.drop_column("campers", "fecha_bautismo")
    op.drop_column("campers", "bautizado")
    op.drop_column("campers", "promocion_detalle")
    op.drop_column("campers", "tiene_promocion")
    op.drop_column("campers", "fecha_pago")
    op.drop_column("campers", "zona")

    sa.Enum(name="zona_enum").drop(bind, checkfirst=True)
