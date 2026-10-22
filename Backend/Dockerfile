FROM python:3.12-slim

# Evitar prompts interactivos durante apt
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Instalar dependencias del sistema operativo requeridas para PostgreSQL y WeasyPrint (PDF/A)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el codigo fuente del backend
COPY . .

# Recolectar archivos estaticos para el panel administrativo y WhiteNoise
RUN python manage.py collectstatic --noinput

# Puerto de escucha para Render (asignado dinamicamente via $PORT)
EXPOSE 8000

# Ejecutar migraciones e iniciar servidor WSGI Gunicorn
CMD sh -c "python manage.py migrate --noinput && gunicorn CAVI_API.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 120"
