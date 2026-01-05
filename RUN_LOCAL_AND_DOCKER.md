# RUN_LOCAL_AND_DOCKER.md
# Guia Único e Completo de Execução – Backend e Frontend (Docker e Local)

Este arquivo contém **TODAS** as instruções necessárias para:
- Subir
- Parar
- Desenvolver
- Depurar

a aplicação **alex_vcel**, incluindo **Docker, Backend FastAPI e Frontend Next.js**.

Nada fora deste arquivo é necessário para operar o projeto.

---

## Estrutura do Projeto (Referência)

alex_vcel/
├─ backend/ # FastAPI
├─ frontend/ # Next.js
├─ docker-compose.yml
├─ requirements.txt
├─ .env
└─ vercel.json


---

# MODO A — Rodar TUDO via Docker (Stack Completa)

## Subir toda a aplicação
```powershell
docker compose up -d --build

docker compose logs -f

docker compose logs -f api

docker compose logs -f postgres
 docker compose down

 MODO B — Postgres no Docker + Backend e Frontend LOCAL (RECOMENDADO)

Este é o modo oficial recomendado para desenvolvimento diário.

1) Subir SOMENTE o Postgres (Docker)
docker compose up -d postgres


Verificar:

docker compose ps

2) Backend Local (FastAPI)
Entrar no backend
cd backend

Ativar virtualenv
..\.\.venv\Scripts\Activate.ps1

Instalar dependências
pip install -r requirements.txt

Variáveis de ambiente (PowerShell)
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/alex"
$env:CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"

Rodar migrations
python -m backend.database.run_migrations

Iniciar backend
python -m uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000


Backend disponível em:

http://localhost:8000

3) Frontend Local (Next.js)

Abrir OUTRO terminal.

cd frontend

Instalar dependências
npm install

Variável de ambiente
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"

Iniciar frontend
npm run dev


Frontend disponível em:

http://localhost:3000

Parar tudo (Modo B)

Backend:

CTRL + C


Frontend:

CTRL + C


Postgres:

docker compose stop postgres

MODO C — Rodar TUDO Local (Sem Docker)

Requer PostgreSQL instalado e rodando localmente na porta 5432.

Backend
cd backend
pip install -r requirements.txt
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/alex"
python -m backend.database.run_migrations
python -m uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000

Frontend
cd frontend
npm install
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev

Comandos Docker Essenciais

Parar containers sem apagar dados:

docker compose stop


Derrubar containers mantendo volumes:

docker compose down


Derrubar TUDO e apagar banco (CUIDADO):

docker compose down -v

Validações Importantes (Checklist)

 DATABASE_URL correto no Docker

 DATABASE_URL correto no local

 Nunca usar localhost entre containers

 Sempre usar nome do serviço Docker (alex-postgres)

 Banco inicializado via migrations

 CORS configurado corretamente

 Clerk funcionando com Bearer Token

 Backend responde /api/user

 Frontend comunica com backend
