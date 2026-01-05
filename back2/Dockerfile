FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    APP_MODULE=backend.api.main:app

WORKDIR /app

# Dependências de sistema (psycopg2 às vezes precisa de build tools)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copia o requirements do back2 (onde você vai manter ele)
COPY back2/requirements.txt ./requirements.txt

# Instala deps Python
RUN pip install --no-cache-dir -r requirements.txt

# Copia o backend (onde está o FastAPI)
COPY backend ./backend

EXPOSE 8000

CMD ["sh", "-c", "uvicorn ${APP_MODULE} --host 0.0.0.0 --port ${PORT}"]
