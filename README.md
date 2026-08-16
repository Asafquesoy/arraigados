# Arraigados — Sistema de registro de campamento

Registro web para el campamento **Arraigados** (Dunamis, noviembre 2026): formulario público
con carga de comprobante de pago y panel administrativo protegido para verificar pagos.

## Stack

- **Frontend:** React 18 + TypeScript + Vite, servido por Nginx.
- **Backend:** FastAPI + SQLAlchemy + Alembic.
- **Base de datos:** PostgreSQL.
- **Contenerización:** Docker / docker-compose, listo para un Droplet de DigitalOcean.

## Desarrollo local

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # en Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env   # ajusta DATABASE_URL a tu Postgres local si no usas Docker
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend en desarrollo corre en `http://localhost:5173` y proxya `/api` hacia
`http://localhost:8000` (ver `vite.config.ts`).

## Feature flag: talla de camisa

El campo de talla de camisa se controla con una sola constante en
`frontend/src/config.ts`:

```ts
export const SHOW_SHIRT_SIZE = true; // cámbialo a false para ocultarlo
```

Al apagarlo desaparece del formulario de registro y de la columna correspondiente en el panel
admin. El campo es opcional en la base de datos, así que no rompe nada ni requiere migración.

## Despliegue en un Droplet de DigitalOcean

1. Crea un Droplet (Ubuntu 22.04+) e instala Docker:

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. Clona el repositorio en el Droplet:

   ```bash
   git clone <tu-repo> arraigados && cd arraigados
   ```

3. Crea el archivo de variables de entorno:

   ```bash
   cp .env.example .env
   nano .env   # define contraseñas, SECRET_KEY y PUBLIC_ORIGIN reales
   ```

4. Ejecuta el script de despliegue:

   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

   El script construye las imágenes, levanta `db`, `backend` y `frontend`, espera a que
   Postgres esté listo, aplica las migraciones con Alembic y reinicia el backend para sembrar
   el usuario administrador definido en `.env`.

5. El sitio queda disponible en el puerto 80 del Droplet. Para HTTPS, coloca Certbot/Nginx (o
   un balanceador de DigitalOcean) delante del contenedor `frontend`, o añade un servicio
   `certbot` al `docker-compose.yml` apuntando a tu dominio.

### Comandos útiles en producción

```bash
docker compose logs -f            # logs en vivo
docker compose ps                 # estado de los servicios
docker compose restart backend    # reiniciar solo el backend
docker compose exec backend alembic upgrade head   # aplicar nuevas migraciones
docker compose down               # detener todo (los volúmenes pgdata/tickets persisten)
```

## Estructura del proyecto

```
arraigados/
├─ backend/    FastAPI, modelos, migraciones Alembic, Dockerfile
├─ frontend/   React + Vite, Dockerfile con Nginx
├─ imagenes/   logo.png y poster.jpg originales (fuente del lenguaje visual)
├─ docker-compose.yml
├─ deploy.sh
└─ .env.example
```
