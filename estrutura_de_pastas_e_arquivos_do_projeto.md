# Estrutura de Pastas e Arquivos do Projeto

Este documento descreve **como é organizada cada pasta do projeto**, qual a **responsabilidade de cada diretório** e **o papel de cada arquivo principal**.

Ele serve como **referência oficial para onboarding**, manutenção e evolução do sistema.

---

## 1. Visão Geral da Estrutura

```
/
├── api/
├── backend/
├── frontend/
├── scripts/
├── docs/
├── docker-compose.yml
├── Dockerfile
├── vercel.json
├── README.md
└── .env.example
```

---

## 2. Pasta `api/` (Vercel Serverless Functions)

Responsável por **expor endpoints serverless** na Vercel.

```
api/
├── index.py
└── cron/
    └── research.py
```

### Arquivos

- **`index.py`**
  - Entry point da Vercel
  - Exporta a aplicação FastAPI
  - Mapeia rotas `/api/*`

- **`cron/research.py`**
  - Endpoint acionado pelo Vercel Cron
  - Executa o pipeline de pesquisa automaticamente

---

## 3. Pasta `backend/` (Core da Aplicação)

Contém **toda a lógica de negócio**, independente de infraestrutura.

```
backend/
├── api/
├── agents/
├── database/
├── embeddings/
├── ingest/
└── vectorstore/
```

### 3.1 `backend/api/`

```
backend/api/
├── main.py
├── routes/
└── dependencies.py
```

- **`main.py`**: definição da aplicação FastAPI
- **`routes/`**: endpoints HTTP organizados por domínio
- **`dependencies.py`**: dependências compartilhadas (DB, config)

---

### 3.2 `backend/agents/`

Implementa os **agentes de IA**.

```
backend/agents/
├── planner.py
├── researcher.py
├── reporter.py
└── utils.py
```

- **Planner**: orquestra execução
- **Researcher**: coleta dados
- **Reporter**: gera relatórios

---

### 3.3 `backend/database/`

Responsável por **persistência e schema**.

```
backend/database/
├── run_migrations.py
├── seed_data.py
├── reset_db.py
└── models.py
```

- `run_migrations.py`: cria/atualiza schema
- `seed_data.py`: dados iniciais
- `reset_db.py`: reset completo
- `models.py`: modelos/tabelas

---

### 3.4 `backend/embeddings/`

Abstração de **provedores de embedding**.

```
backend/embeddings/
├── provider.py
└── types.py
```

---

### 3.5 `backend/ingest/`

Pipeline de **ingestão e busca vetorial**.

```
backend/ingest/
├── ingest_vectors.py
├── search_vectors.py
└── cleanup_vectors.py
```

---

### 3.6 `backend/vectorstore/`

Camada de armazenamento vetorial.

```
backend/vectorstore/
└── pgvector_store.py
```

---

## 4. Pasta `frontend/` (Next.js)

Interface web da aplicação.

```
frontend/
├── pages/
├── components/
├── lib/
├── styles/
├── public/
└── next.config.ts
```

### Arquivos principais

- `pages/`: rotas da aplicação
- `components/`: componentes reutilizáveis
- `lib/api.ts`: comunicação com backend (`/api/*`)
- `lib/config.ts`: configuração por ambiente

---

## 5. Pasta `scripts/`

Scripts auxiliares **Vercel-friendly**.

```
scripts/
├── deploy.py
├── run_local.py
└── destroy.py
```

- `deploy.py`: deploy via Vercel CLI
- `run_local.py`: execução local completa
- `destroy.py`: teardown local

---

## 6. Pasta `docs/` (Documentação Oficial)

```
docs/
├── README.md
├── OVERVIEW.md
├── SETUP_DEPLOY.md
├── EXECUTION_GUIDE.md
├── RUNBOOK.md
├── ARCHITECTURE.md
├── SECURITY.md
└── ADR/
```

Cada arquivo possui um propósito claro:
- onboarding
- operação
- arquitetura
- segurança

---

## 7. Arquivos de Infraestrutura (Raiz)

### `vercel.json`
- Define rotas
- Define cron jobs

### `docker-compose.yml`
- Postgres local para desenvolvimento

### `Dockerfile`
- Build da aplicação para uso local

---

## 8. Convenções Importantes

- Nenhum código depende de AWS
- Toda configuração via variáveis de ambiente
- Backend e frontend se comunicam via `/api/*`
- Documentação vive em `/docs`

---

## 9. Como evoluir a estrutura

- Novos agentes → `backend/agents/`
- Novos crons → `api/cron/`
- Novos scripts → `scripts/`
- Mudanças arquiteturais → `docs/ADR/`

---

**Este documento é a referência definitiva da estrutura do projeto.**

