# Guia Completo de Execução

Este documento descreve **como executar, desenvolver e fazer deploy** do projeto utilizando **Vercel + FastAPI + Vercel Postgres + Vercel Cron**, com base nos guias originais fornecidos (AWS/Terraform), agora **totalmente adaptados para Vercel**.

---

## 1. Visão Geral da Arquitetura

### Arquitetura Atual (Vercel-first)

- **API**: FastAPI rodando como *Serverless Functions* na Vercel
- **Banco de dados**: Vercel Postgres (PostgreSQL + pgvector)
- **Agentes (Planner, Researcher, Reporter, etc.)**: executados **in-process**
- **Agendamentos**: Vercel Cron
- **Embeddings**: OpenAI-compatible HTTP API
- **Ambiente local**: Docker + Docker Compose

> Todo acoplamento a AWS (Lambda, EventBridge, SQS, S3, SageMaker) foi removido.

---

## 2. Pré-requisitos

### Local

- Python 3.10+
- Docker + Docker Compose
- Git

### Produção (Vercel)

- Conta Vercel
- Vercel Postgres habilitado
- Chave de API de embeddings (ex.: OpenAI)

---

## 3. Estrutura do Projeto

```
api/
  index.py              # Entry point Vercel
  cron/
    research.py         # Endpoint de cron
backend/
  api/                  # FastAPI app
  agents/               # Planner, Researcher, Reporter
  database/             # migrations, seed, reset
  vectorstore/          # pgvector
  embeddings/           # providers
  ingest/               # ingest/search/cleanup
Dockerfile
docker-compose.yml
vercel.json
.env.example
```

---

## 4. Variáveis de Ambiente

### `.env.local` (desenvolvimento)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app
OPENAI_API_KEY=sk-...
EMBEDDINGS_MODEL=text-embedding-3-large
EMBEDDING_DIM=1024
```

### Produção (Vercel → Project Settings → Environment Variables)

- `DATABASE_URL` (Vercel Postgres)
- `OPENAI_API_KEY`
- `EMBEDDING_DIM`

---

## 5. Banco de Dados

### 5.1 Subir Postgres local

```powershell
docker compose up -d
```

### 5.2 Rodar migrations

```powershell
python backend\database\run_migrations.py
```

Inclui:
- Criação das tabelas principais
- Extensão `pgvector`
- Índices de similaridade

### 5.3 Seed de dados

```powershell
python backend\database\seed_data.py
```

### 5.4 Reset completo

```powershell
python backend\database\reset_db.py --with-test-data
```

---

## 6. API FastAPI

### Rodar local

```powershell
docker compose up --build
```

A API ficará disponível em:

```
http://localhost:8000
```

### Exemplo de health check

```
GET /health
```

---

## 7. Ingestão e Busca Vetorial (pgvector)

### Ingestão

```powershell
python backend\ingest\ingest_vectors.py \
  --text "SPY tracks the S&P 500" \
  --title "SPY ETF" \
  --source "manual"
```

### Busca por similaridade

```powershell
python backend\ingest\search_vectors.py --query "S&P 500 ETF" --top-k 5
```

### Limpeza do índice

```powershell
python backend\ingest\cleanup_vectors.py
```

---

## 8. Agentes (Planner, Researcher, Reporter)

### Arquitetura de agentes

- **Planner**: coordena o pipeline
- **Researcher**: coleta e estrutura informações
- **Reporter**: gera relatórios usando vetores + LLM

Todos executam **no mesmo processo**, sem filas externas.

---

## 9. Cron Jobs (Vercel Cron)

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

### Endpoint de cron

```
POST /api/cron/research
```

Executa o pipeline automaticamente a cada 2 horas.

---

## 10. Deploy na Vercel

1. Importar o repositório no Vercel
2. Criar Vercel Postgres
3. Configurar variáveis de ambiente
4. Deploy

Após o deploy:
- API ativa
- Banco conectado
- Cron rodando automaticamente

---

## 11. Observações Importantes

- Vercel possui **timeout** para funções (Edge/Serverless)
- Jobs longos devem ser:
  - quebrados em etapas
  - ou executados via múltiplos crons
- pgvector é suportado no Vercel Postgres

---

## 12. Próximos Passos (Opcional)

- Observabilidade (logs estruturados)
- Dashboard admin
- Rate limiting
- Autenticação
- Multi-tenant (enterprise)

---

## 13. Diferença em relação aos guias originais (AWS)

| Guia Original | Equivalente Vercel |
|--------------|-------------------|
| IAM / Permissions | Env Vars |
| Lambda | Serverless Functions |
| EventBridge | Vercel Cron |
| S3 Vectors | Postgres + pgvector |
| SageMaker | OpenAI-compatible API |

---

## 14. Suporte

Se precisar:
- adicionar novos crons
- criar novos agentes
- otimizar custos/tempo de execução

Basta seguir o mesmo padrão descrito neste guia.

---

## 15. Guia Operacional (Runbook)

### 15.1 Falha no Cron

**Sintoma**: Cron não executa ou retorna erro.

Checklist:
- Verificar logs da Function `/api/cron/research` na Vercel
- Confirmar se `DATABASE_URL` está configurada
- Confirmar se `OPENAI_API_KEY` está válida
- Verificar timeout (jobs > 60s devem ser quebrados)

---

### 15.2 Falha de Embeddings

**Sintoma**: Erro ao gerar vetores.

Checklist:
- Verificar `EMBEDDINGS_MODEL`
- Conferir `EMBEDDING_DIM`
- Validar limites da API de embeddings

---

### 15.3 Banco indisponível

**Sintoma**: Erros 500 ou falha de conexão.

Checklist:
- Conferir status do Vercel Postgres
- Validar `DATABASE_URL`
- Testar localmente via `psql`

---

## 16. Padrões para Novos Scripts

### Scripts CLI

Todo script deve:
- Ler configuração apenas de variáveis de ambiente
- Nunca depender de AWS SDKs
- Suportar execução local e CI

Exemplo:

```python
import os
DATABASE_URL = os.getenv("DATABASE_URL")
```

---

## 17. Padrão para Novos Crons

1. Criar endpoint em `api/cron/<job>.py`
2. Implementar lógica idempotente
3. Registrar cron no `vercel.json`

Exemplo:

```json
{
  "path": "/api/cron/job",
  "schedule": "0 3 * * *"
}
```

---

## 18. Segurança

- Nunca commitar `.env`
- Usar apenas variáveis de ambiente na Vercel
- Rotacionar chaves de API periodicamente

---

## 19. Escalabilidade

- Jobs longos → dividir em múltiplos crons
- Processamento pesado → dividir por lote
- Vetores → indexar por tenant/fonte

---

## 20. Checklist de Produção

- [ ] Variáveis de ambiente configuradas
- [ ] Migrations aplicadas
- [ ] Seed executado (se necessário)
- [ ] Cron validado manualmente
- [ ] Logs verificados
- [ ] Limites de timeout conhecidos

---

## 21. Referência dos Guides Originais

Este documento consolida e substitui:
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

Agora todos reinterpretados para **Vercel + FastAPI + Postgres**.
