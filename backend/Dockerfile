FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libmagic1 tesseract-ocr tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data/tickets

EXPOSE 8000

# --proxy-headers/--forwarded-allow-ips: sin esto request.client.host es siempre
# la IP del contenedor de Nginx y el rate limit (registro: 10 / 10 min, login: 8 /
# 5 min) es global para todo el sitio en vez de por persona. El backend solo es
# alcanzable por la red de compose (Nginx del contenedor frontend), así que
# confiar en X-Forwarded-For es seguro.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
