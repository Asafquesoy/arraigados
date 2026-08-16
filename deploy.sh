#!/usr/bin/env bash
# Despliegue del sistema Arraigados en un Droplet de DigitalOcean.
# Uso: ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Falta el archivo .env. Copia .env.example a .env y complétalo antes de continuar."
  exit 1
fi

echo "==> Construyendo imágenes"
docker compose build

echo "==> Levantando servicios"
docker compose up -d

echo "==> Esperando a que la base de datos esté lista"
until docker compose exec -T db pg_isready -U "$(grep POSTGRES_USER .env | cut -d '=' -f2)" >/dev/null 2>&1; do
  sleep 2
done

echo "==> Aplicando migraciones"
docker compose exec -T backend alembic upgrade head

echo "==> Reiniciando backend para sembrar el usuario administrador"
docker compose restart backend

echo "==> Estado de los servicios"
docker compose ps

echo
echo "Listo. El sitio queda disponible en el puerto 80 del Droplet."
echo "Revisa logs con: docker compose logs -f"
