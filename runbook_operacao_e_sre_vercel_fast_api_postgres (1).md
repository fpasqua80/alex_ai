# Guia Completo de Execução (Atualizado – Vercel Stack)

Este documento **substitui integralmente** os guides originais baseados em AWS/Terraform. Ele reflete **todas as alterações realizadas no projeto**, consolidando backend, frontend, infraestrutura, scripts e operação usando **Vercel + FastAPI + Vercel Postgres + Vercel Cron**.

---

## 1. Arquitetura Oficial Atual

### Stack Final

- **Frontend**: Next.js (Vercel, mesmo domínio)
- **Backend**: FastAPI (Serverless Functions – Vercel)
- **Banco de Dados**: Vercel Postgres (PostgreSQL + pgvector)
- **Vetores**: pgvector (no Postgres)
- **Embeddings**: OpenAI-compatible HTTP API
- **Agendamentos**: Vercel Cron
- **Infraestrutura**: Vercel (sem Terraform)

> AWS, Terraform, Lambda, EventBridge, S3, SageMaker e IAM foram completamente removidos.

---

## 2. Mapeamento AWS → Vercel (Definitivo)

| AWS / Terraform | Vercel |
|---------------|--------|
| Lambda | Serverless Functions |
| API Gateway | Rotas `/api/*` |
| EventBridge Scheduler | Vercel Cron |
| RDS / Aurora | Vercel Postgres |
| S3 Vectors | Postgres + pgvector |
| SageMaker | OpenAI-compatible API |
| IAM | Environment Variables |
| Terraform Apply | Vercel Deploy |

---

## 3. Estrutura Oficial do Repositório

```
/
├── api/                 # Backend (Vercel Functions)
│   └── cron/
├── backend/             # Core da aplicação
│   ├── api/
│   ├── agents/
│   ├── database/
│   ├── embeddings/
│   ├── ingest/
│   └── vectorstore/
├── frontend/            # Next.js
├── scripts/             # Scripts Vercel-friendly
├── docker-compose.yml   # Postgres local
├── Dockerfile
├── vercel.json          # Infra + Cron
├── README.md
├── RUNBOOK.md
└── .env.example
```

---

## 4. Variáveis de Ambiente (Padrão Único)

### Local (`.env.local`)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app
OPENAI_API_KEY=sk-...
EMBEDDINGS_MODEL=text-embedding-3-large
EMBEDDING_DIM=1024
```

### Produção (Vercel)

Configurar em **Project Settings → Environment Variables**:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `EMBEDDING_DIM`

---

## 5. Backend (FastAPI)

### Execução local

```powershell
docker compose up --build
```

Backend disponível em:

```
http://localhost:8000
```

### Health check

```
GET /health
```

---

## 6. Banco de Dados

### Subir Postgres local

```powershell
docker compose up -d
```

### Migrations

```powershell
python backend\database\run_migrations.py
```

Inclui:
- Tabelas principais
- Extensão `pgvector`
- Índices vetoriais

### Seed

```powershell
python backend\database\seed_data.py
```

---

## 7. Vetores e Ingestão

### Ingestão manual

```powershell
python backend\ingest\ingest_vectors.py \
  --text "SPY tracks the S&P 500" \
  --title "SPY ETF" \
  --source "manual"
```

### Busca

```powershell
python backend\ingest\search_vectors.py --query "S&P 500 ETF" --top-k 5
```

---

## 8. Agentes

- **Planner**: orquestra execução
- **Researcher**: coleta dados
- **Reporter**: gera relatórios

Todos executam **in-process**, sem filas externas.

---

## 9. Frontend (Next.js)

- Deploy na Vercel
- Comunicação com backend via **mesmo domínio** (`/api/*`)
- Sem variáveis de API URL em produção

Local:

```powershell
cd frontend
npm install
npm run dev
```

---

## 10. Cron Jobs

### Configuração (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron/research",
      "schedule": "0 */2 * * *"
    }
  ]
}
```

### Execução manual

```bash
curl -X POST https://<dominio>/api/cron/research
```

---

## 11. Infraestrutura (Sem Terraform)

Infra agora é declarada por:

- `vercel.json`
- Environment Variables
- Vercel Postgres

Scripts auxiliares:

```powershell
python scripts\deploy.py
python scripts\run_local.py
python scripts\destroy.py
```

---

## 12. Deploy Oficial

1. Importar repositório na Vercel
2. Criar Vercel Postgres
3. Configurar variáveis de ambiente
4. Deploy

---

## 13. Operação e SRE

➡️ **Consultar `RUNBOOK.md`** para:
- Incidentes
- Crons
- Banco
- Embeddings

---

## 14. Checklist Final

- [ ] Backend responde `/health`
- [ ] Frontend chama `/api/*`
- [ ] Migrations aplicadas
- [ ] Cron executa
- [ ] Logs verificados

---

## 15. Status dos Guides Originais

Os seguintes arquivos estão **obsoletos**:

- `architecture.md`
- `agent_architecture.md`
- `1_permissions.md`
- `2_sagemaker.md`
- `3_ingest.md`
- `4_researcher.md`
- `5_database.md`
- `6_agents.md`
- `7_frontend.md`
- `8_enterprise.md`

Todo o conteúdo foi **consolidado neste documento**, no README.md e no RUNBOOK.md.

---

**Este é agora o guia oficial e único do projeto.**

