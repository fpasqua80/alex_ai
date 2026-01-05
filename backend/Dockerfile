# syntax=docker/dockerfile:1
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Dependências
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Código
COPY . /app

EXPOSE 8000

# Seu main.py está em /app/api/main.py
ENV APP_MODULE=api.main:app \
    PORT=8000

CMD ["sh", "-lc", "uvicorn \"$APP_MODULE\" --host 0.0.0.0 --port \"$PORT\""]
