"""Respaldo completo (zip de CSVs) para llevar la base a una laptop sin internet.

Se descarga desde la página en línea y se importa en la laptop del campamento:
`GET /api/admin/respaldo.zip` y `POST /api/admin/respaldo/importar`
(`routers/respaldo.py`), o por consola:

    python -m app.respaldo exportar respaldo.zip
    python -m app.respaldo importar respaldo.zip [--si]

Contenido del zip (CSV UTF-8 con BOM, ids originales para no romper `equipo_id`):
  - `manifiesto.json`: formato, versión de alembic, fecha y conteos.
  - `equipos.csv`, `registros.csv`, `calificaciones.csv`, `puntos_extra.csv`: todas las columnas.
    `registros` no lleva `ticket_path`/`ticket_mime` (las imágenes no viajan: en la
    laptop quedan "sin comprobante" en vez de un "Ver comprobante" que daría 404)
    ni `ocr_texto` (pesa y no sirve fuera de la conciliación).
  - `ajustes.csv`: `app_settings` SIN `registro_abierto`/`registro_cierre_en`: si el
    registro está abierto o cerrado lo decide la laptop, no el archivo.
No viajan `admin_users` (las cuentas de la laptop se quedan) ni `comprobante_eventos`.

Importar REEMPLAZA registros, equipos, calificaciones y puntos extra. Todo se valida antes de tocar
la base y el reemplazo es una sola transacción. Las columnas se (de)serializan de
forma genérica desde `Model.__table__`, así que una columna nueva viaja sola — pero
la versión de alembic de la laptop debe coincidir con la del archivo.

A diferencia de `routers/admin.py::_sanitizar_celda`, aquí NO se antepone `'` a los
valores que empiezan con `=`/`+`/`-`/`@`: corrompería el viaje de ida y vuelta. Este
zip es para importarse, no para abrirlo en Excel y guardarlo (para eso sigue el
"Exportar CSV"/XLSX de siempre).
"""

import argparse
import csv
import io
import json
import logging
import sys
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, Integer, JSON, String, func, insert, text
from sqlalchemy.orm import Session

from .concurrencia import candado_equipos
from .config import settings
from .models import AppSettings, Calificacion, Camper, ComprobanteEvento, Equipo, PuntosExtra

log = logging.getLogger("arraigados.respaldo")

FORMATO = 1
# Tope por archivo ya descomprimido (la lectura es acotada: no confía en el tamaño declarado del zip).
LIMITE_ARCHIVO_BYTES = 40 * 1024 * 1024

# Orden de borrado inverso al de inserción (las FK apuntan de calificaciones/campers a equipos).
TABLAS = {
    "equipos": (Equipo, ()),
    "registros": (Camper, ("ticket_path", "ticket_mime", "ocr_texto")),
    "calificaciones": (Calificacion, ()),
    "puntos_extra": (PuntosExtra, ()),
}
AJUSTES_EXCLUIDOS = ("id", "registro_abierto", "registro_cierre_en")
NOMBRES_ZIP = {"manifiesto.json", "ajustes.csv", *(f"{t}.csv" for t in TABLAS)}


class RespaldoError(ValueError):
    """Archivo inválido o no importable (422)."""


class RespaldoVersionError(RespaldoError):
    """La versión del esquema no coincide con la del archivo (409)."""


# ---- columnas <-> texto ----


def _columnas(modelo, excluir=()):
    return [c for c in modelo.__table__.columns if c.name not in excluir]


def _a_utc(dt: datetime) -> datetime:
    # SQLite devuelve los datetimes sin zona; el backend siempre escribe UTC.
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _a_texto(col, valor) -> str:
    if valor is None:
        return ""
    tipo = col.type
    if isinstance(tipo, SAEnum):  # antes que String: Enum hereda de String
        return valor.name
    if isinstance(tipo, Boolean):
        return "true" if valor else "false"
    if isinstance(tipo, DateTime):
        return _a_utc(valor).isoformat()
    if isinstance(tipo, Date):
        return valor.isoformat()
    if isinstance(tipo, JSON):
        return json.dumps(valor, ensure_ascii=False)
    return str(valor)


def _de_texto(col, s: str):
    tipo = col.type
    if s == "":
        if col.nullable:
            return None
        if isinstance(tipo, String) and not isinstance(tipo, SAEnum):
            return ""
        raise ValueError("falta el valor")
    try:
        if isinstance(tipo, SAEnum):
            return tipo.enum_class[s]
        if isinstance(tipo, Boolean):
            if s.lower() not in ("true", "false"):
                raise ValueError(s)
            return s.lower() == "true"
        if isinstance(tipo, Integer):
            return int(s)
        if isinstance(tipo, DateTime):
            return _a_utc(datetime.fromisoformat(s.replace("Z", "+00:00")))
        if isinstance(tipo, Date):
            return date.fromisoformat(s)
        if isinstance(tipo, JSON):
            return json.loads(s)
    except (ValueError, TypeError, KeyError):  # JSONDecodeError es un ValueError
        raise ValueError(f"valor no válido «{s}»") from None
    return s


def _csv_bytes(columnas, filas) -> bytes:
    buf = io.StringIO()
    buf.write("﻿")  # BOM: Excel detecta UTF-8 y no mancha los acentos
    w = csv.writer(buf)
    w.writerow([c.name for c in columnas])
    for obj in filas:
        w.writerow([_a_texto(c, getattr(obj, c.key)) for c in columnas])
    return buf.getvalue().encode("utf-8")


# ---- versión / conteos ----


def version_local(db: Session) -> str | None:
    try:
        return db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:  # sin tabla de alembic (base creada de otra forma)
        db.rollback()
        return None


def contar(db: Session) -> dict[str, int]:
    return {
        nombre: db.query(func.count(modelo.id)).scalar() or 0 for nombre, (modelo, _) in TABLAS.items()
    }


# ---- exportar ----


def exportar_zip(db: Session) -> bytes:
    conteos = contar(db)
    manifiesto = {
        "formato": FORMATO,
        "alembic_version": version_local(db),
        "creado_en": datetime.now(timezone.utc).isoformat(),
        "conteos": conteos,
    }
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifiesto.json", json.dumps(manifiesto, ensure_ascii=False, indent=2))
        for nombre, (modelo, excluir) in TABLAS.items():
            filas = db.query(modelo).order_by(modelo.id).all()
            zf.writestr(f"{nombre}.csv", _csv_bytes(_columnas(modelo, excluir), filas))
        ajustes = db.get(AppSettings, 1)
        cols = _columnas(AppSettings, AJUSTES_EXCLUIDOS)
        zf.writestr("ajustes.csv", _csv_bytes(cols, [ajustes] if ajustes else []))
    return salida.getvalue()


# ---- leer y validar ----


class Respaldo:
    def __init__(self, manifiesto: dict, tablas: dict[str, list[dict]], ajustes: dict | None):
        self.manifiesto = manifiesto
        self.tablas = tablas
        self.ajustes = ajustes

    @property
    def conteos(self) -> dict[str, int]:
        return {n: len(filas) for n, filas in self.tablas.items()}


def _leer_miembro(zf: zipfile.ZipFile, nombre: str) -> bytes:
    with zf.open(nombre) as f:
        datos = f.read(LIMITE_ARCHIVO_BYTES + 1)
    if len(datos) > LIMITE_ARCHIVO_BYTES:
        raise RespaldoError(f"{nombre}: el archivo es demasiado grande.")
    return datos


def _leer_csv(datos: bytes, nombre: str, columnas) -> list[dict]:
    try:
        texto = datos.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise RespaldoError(f"{nombre}: no está en UTF-8.") from None
    lector = csv.DictReader(io.StringIO(texto))
    esperadas = [c.name for c in columnas]
    if lector.fieldnames is None or sorted(lector.fieldnames) != sorted(esperadas):
        faltan = sorted(set(esperadas) - set(lector.fieldnames or []))
        sobran = sorted(set(lector.fieldnames or []) - set(esperadas))
        raise RespaldoError(
            f"{nombre}: las columnas no coinciden con esta versión (faltan: {faltan or '—'}; sobran: {sobran or '—'})."
        )
    filas = []
    for n, fila in enumerate(lector, start=2):  # el renglón 1 es el encabezado
        if None in fila or any(v is None for v in fila.values()):
            raise RespaldoError(f"{nombre}, renglón {n}: tiene más o menos celdas que el encabezado.")
        convertida = {}
        for c in columnas:
            try:
                convertida[c.name] = _de_texto(c, fila[c.name])
            except ValueError as e:
                raise RespaldoError(f"{nombre}, renglón {n}, columna «{c.name}»: {e}") from None
        filas.append(convertida)
    return filas


def _revisar_relaciones(tablas: dict[str, list[dict]]) -> None:
    ids_equipos = {e["id"] for e in tablas["equipos"]}
    for nombre in TABLAS:
        ids = [f["id"] for f in tablas[nombre]]
        if len(ids) != len(set(ids)):
            raise RespaldoError(f"{nombre}.csv: hay ids repetidos.")
    nombres = [e["nombre"].casefold() for e in tablas["equipos"]]
    if len(nombres) != len(set(nombres)):
        raise RespaldoError("equipos.csv: hay equipos con el mismo nombre.")
    folios = [r["folio"] for r in tablas["registros"]]
    if len(folios) != len(set(folios)):
        raise RespaldoError("registros.csv: hay folios repetidos.")
    for n, r in enumerate(tablas["registros"], start=2):
        if r["equipo_id"] is not None and r["equipo_id"] not in ids_equipos:
            raise RespaldoError(f"registros.csv, renglón {n}: equipo_id {r['equipo_id']} no existe en equipos.csv.")
    for n, c in enumerate(tablas["calificaciones"], start=2):
        if c["equipo_id"] not in ids_equipos:
            raise RespaldoError(f"calificaciones.csv, renglón {n}: equipo_id {c['equipo_id']} no existe en equipos.csv.")
    for n, x in enumerate(tablas["puntos_extra"], start=2):
        if x["equipo_id"] not in ids_equipos:
            raise RespaldoError(f"puntos_extra.csv, renglón {n}: equipo_id {x['equipo_id']} no existe en equipos.csv.")


def leer_zip(datos: bytes) -> Respaldo:
    """Valida TODO el archivo sin tocar la base; lanza `RespaldoError` con
    «archivo, renglón: motivo» si algo no cuadra."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(datos))
    except zipfile.BadZipFile:
        raise RespaldoError("El archivo no es un respaldo válido (no es un .zip).") from None
    with zf:
        nombres = set(zf.namelist())
        if nombres != NOMBRES_ZIP:
            faltan = sorted(NOMBRES_ZIP - nombres)
            sobran = sorted(nombres - NOMBRES_ZIP)
            raise RespaldoError(
                f"El zip no es un respaldo de Arraigados de esta versión (faltan: {faltan or '—'}; sobran: {sobran or '—'}). "
                "Si es un respaldo viejo, descarga uno nuevo desde la página en línea ya actualizada."
            )
        try:
            manifiesto = json.loads(_leer_miembro(zf, "manifiesto.json"))
        except json.JSONDecodeError:
            raise RespaldoError("manifiesto.json: no se puede leer.") from None
        if not isinstance(manifiesto, dict) or manifiesto.get("formato") != FORMATO:
            raise RespaldoError("El respaldo es de un formato que esta versión no entiende.")
        tablas = {
            nombre: _leer_csv(_leer_miembro(zf, f"{nombre}.csv"), f"{nombre}.csv", _columnas(modelo, excluir))
            for nombre, (modelo, excluir) in TABLAS.items()
        }
        filas_ajustes = _leer_csv(
            _leer_miembro(zf, "ajustes.csv"), "ajustes.csv", _columnas(AppSettings, AJUSTES_EXCLUIDOS)
        )
    _revisar_relaciones(tablas)
    return Respaldo(manifiesto, tablas, filas_ajustes[0] if filas_ajustes else None)


def revisar_version(db: Session, respaldo: Respaldo) -> None:
    del_archivo = respaldo.manifiesto.get("alembic_version")
    local = version_local(db)
    if del_archivo and local and del_archivo != local:
        raise RespaldoVersionError(
            f"Esta computadora tiene otra versión de la base ({local}) que el respaldo ({del_archivo}). "
            "Actualiza el código (git pull) y corre `alembic upgrade head`."
        )


def resumen(db: Session, respaldo: Respaldo) -> dict:
    return {
        "creado_en": respaldo.manifiesto.get("creado_en"),
        "version": respaldo.manifiesto.get("alembic_version"),
        "archivo": respaldo.conteos,
        "actual": contar(db),
    }


# ---- importar ----


def guardar_copia_previa(db: Session) -> Path:
    """Copia de lo que hay ahora, antes de reemplazarlo (por si se importó el archivo equivocado)."""
    carpeta = Path(settings.respaldos_dir)
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / f"antes_de_importar_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    destino.write_bytes(exportar_zip(db))
    return destino


def importar(db: Session, respaldo: Respaldo) -> dict[str, int]:
    """Reemplaza registros, equipos y calificaciones por los del respaldo, en una
    sola transacción y bajo el candado de equipos (nadie da de alta ni reparte a
    mitad). Conserva los ids originales."""
    with candado_equipos(db):
        try:
            # Borrado explícito y en este orden: SQLite no aplica los ON DELETE.
            db.query(PuntosExtra).delete()
            db.query(Calificacion).delete()
            db.query(ComprobanteEvento).delete()
            db.query(Camper).delete()
            db.query(Equipo).delete()
            for nombre, (modelo, _) in TABLAS.items():
                filas = respaldo.tablas[nombre]
                if filas:
                    db.execute(insert(modelo.__table__), filas)
            if respaldo.ajustes:
                fila = db.get(AppSettings, 1)
                if fila is None:
                    fila = AppSettings(id=1)
                    db.add(fila)
                for campo, valor in respaldo.ajustes.items():
                    if valor is not None:
                        setattr(fila, campo, valor)
            if db.get_bind().dialect.name == "postgresql":
                # Los ids vinieron explícitos: sin esto el siguiente alta choca con uno existente.
                for _, (modelo, _) in TABLAS.items():
                    tabla = modelo.__tablename__
                    db.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{tabla}', 'id'), "
                            f"COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM {tabla}"
                        )
                    )
            db.commit()
        except Exception:
            db.rollback()
            raise
    return contar(db)


# ---- consola ----


def _main(argv: list[str]) -> int:
    from .database import SessionLocal

    p = argparse.ArgumentParser(prog="python -m app.respaldo", description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("exportar", help="guarda un respaldo .zip de la base actual")
    e.add_argument("archivo")
    i = sub.add_parser("importar", help="REEMPLAZA registros, equipos y calificaciones con los de un respaldo")
    i.add_argument("archivo")
    i.add_argument("--si", action="store_true", help="no pedir confirmación")
    args = p.parse_args(argv)

    db = SessionLocal()
    try:
        if args.cmd == "exportar":
            Path(args.archivo).write_bytes(exportar_zip(db))
            print(f"Respaldo guardado en {args.archivo}: {contar(db)}")
            return 0

        if not settings.permitir_importar_respaldo:
            print("Importar está apagado en esta computadora (PERMITIR_IMPORTAR_RESPALDO=false).")
            return 1
        try:
            respaldo = leer_zip(Path(args.archivo).read_bytes())
            revisar_version(db, respaldo)
        except (RespaldoError, OSError) as err:
            print(f"No se puede importar: {err}")
            return 1
        r = resumen(db, respaldo)
        print(f"Respaldo del {r['creado_en']}: {r['archivo']}")
        print(f"Esta computadora tiene ahora: {r['actual']} — se va a REEMPLAZAR.")
        if not args.si and input("Escribe «si» para continuar: ").strip().lower() != "si":
            print("Cancelado.")
            return 1
        copia = guardar_copia_previa(db)
        print(f"Copia de lo anterior en {copia}")
        print(f"Listo: {importar(db, respaldo)}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
