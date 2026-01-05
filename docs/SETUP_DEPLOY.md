# Guia de Setup e Deploy

## Pré-requisitos
- Node.js 18+
- Python 3.10+
- Docker
- Vercel CLI

## Variáveis de Ambiente
Criar `.env.local`:

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app
OPENAI_API_KEY=sk-...
EMBEDDING_DIM=1024

## Setup Local
docker compose up -d
python backend/database/run_migrations.py

## Deploy
vercel login
vercel deploy --prod
