"""Candado para lo que decide equipos a partir de "cómo está todo ahora".

Varias personas registran y reparten a la vez el día del campamento. Dos altas
simultáneas (o un alta durante "Repartir a todos") leerían los mismos miembros,
elegirían con datos viejos y harían commit cada una por su lado. Todo lo que lee
la distribución de equipos y luego escribe una asignación (alta en sitio, alta
pública, reparto masivo) entra por `candado_equipos`.

Dos capas, la primera es la que cubre producción (un solo worker de uvicorn, mismo
supuesto que `ratelimit.py`):
- `threading.RLock`: serializa los hilos del threadpool de FastAPI. Reentrante
  para que un endpoint que ya lo tiene pueda llamar al helper de auto-equipo.
- `pg_advisory_xact_lock` en Postgres: lo mismo entre procesos, por si algún día
  hay más de un worker. Se suelta solo al terminar la transacción (commit/rollback),
  así que quien lo toma debe hacer su commit dentro del `with`. En SQLite no hace
  falta (dev, un solo proceso)."""

from contextlib import contextmanager
import threading

from sqlalchemy import text
from sqlalchemy.orm import Session

_LOCK_EQUIPOS = threading.RLock()
_CLAVE_ADVISORY = 7_261_103  # número arbitrario, único para "equipos"


@contextmanager
def candado_equipos(db: Session):
    with _LOCK_EQUIPOS:
        if db.get_bind().dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _CLAVE_ADVISORY})
        yield
