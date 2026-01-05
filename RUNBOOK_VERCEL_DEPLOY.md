# RUNBOOK – Configurar, Instalar e Subir a Aplicação Completa na Vercel
*(Frontend Next.js + Backend FastAPI Serverless + Vercel Postgres + Vercel Cron)*

Este runbook é um **passo a passo operacional** para instalar dependências, configurar variáveis, provisionar **Vercel Postgres**, fazer **deploy** (preview e produção), executar **migrations**, validar **cron jobs** e checar logs.

> Padrão do projeto: **frontend e backend no mesmo domínio** (frontend chama backend via `/api/*`).

---

## 0) Pré-requisitos

### 0.1 Contas e acessos
- Conta Vercel com permissão para criar projetos e Storage (Postgres).
- Acesso ao repositório Git (GitHub/GitLab/Bitbucket).
- Chave de API do provedor de embeddings (ex.: OpenAI) para `OPENAI_API_KEY`.

### 0.2 Ferramentas locais (máquina do deploy)
Instale:

- **Node.js 18+** (recomendado LTS)
- **npm** (vem com Node) ou pnpm/yarn (o runbook usa npm)
- **Python 3.10+**
- **Git**
- **Vercel CLI**

Instalar Vercel CLI:
```bash
npm install -g vercel
```

Verificar versões:
```bash
node -v
npm -v
python --version
git --version
vercel --version
```

---

## 1) Estrutura esperada do repositório

Na raiz do repo, confirme que existem:

- `vercel.json` (crons e ajustes)
- `api/` (serverless functions FastAPI entrypoints)
- `backend/` (core FastAPI, agents, db, vectorstore)
- `frontend/` (Next.js)
- `.env.example` (referência, **não** versionar `.env.local`)

Exemplo:
```
/
├── api/
├── backend/
├── frontend/
├── vercel.json
├── docker-compose.yml
└── .env.example
```

---

## 2) Clonar e instalar dependências (primeira vez)

### 2.1 Clonar
```bash
git clone <URL_DO_REPO>
cd <PASTA_DO_REPO>
```

### 2.2 Instalar dependências do frontend (local)
```bash
cd frontend
npm install
cd ..
```

### 2.3 Dependências do backend (local)
> Para deploy na Vercel, o backend deve ter `requirements.txt` ou `pyproject.toml` compatível.

Se você usa `pip`:
```bash
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```
Se o projeto usa `pyproject.toml`, instale com o gerenciador (ex.: `uv`, `poetry`) conforme seu setup.

---

## 3) Login e link do projeto na Vercel

### 3.1 Login
```bash
vercel login
```

### 3.2 Linkar o repo a um projeto Vercel
Na raiz do repo:
```bash
vercel link
```

Siga o wizard:
- Selecione o **scope** (sua conta/time)
- Escolha **criar** um novo projeto ou **linkar** em um existente

> Isso cria `.vercel/` localmente (não é segredo).

---

## 4) Provisionar Vercel Postgres

### 4.1 Criar Postgres (Dashboard)
1. Abra o **Vercel Dashboard**
2. Entre no projeto
3. Vá em **Storage**
4. Clique **Create** → **Postgres**
5. Após criado, copie a **DATABASE_URL**

### 4.2 Variáveis adicionais do Postgres
Dependendo do console, a Vercel pode fornecer também variações como `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, etc.
**Use sempre `DATABASE_URL` como fonte principal** no seu app.

---

## 5) Configurar variáveis de ambiente (Vercel)

### 5.1 Variáveis obrigatórias
- `DATABASE_URL` → string do Vercel Postgres
- `OPENAI_API_KEY` → chave do provedor de embeddings
- `EMBEDDING_DIM` → dimensão usada no pgvector (ex.: `1024`)
- `EMBEDDINGS_MODEL` → modelo de embeddings (ex.: `text-embedding-3-large`) *(se aplicável no seu código)*

### 5.2 Definir env vars via CLI (produção)
Na raiz do repo:
```bash
vercel env add DATABASE_URL production
vercel env add OPENAI_API_KEY production
vercel env add EMBEDDING_DIM production
vercel env add EMBEDDINGS_MODEL production
```

> Cole o valor quando solicitado.  
> Repita para `preview` se você quiser preview com banco real:

```bash
vercel env add DATABASE_URL preview
vercel env add OPENAI_API_KEY preview
vercel env add EMBEDDING_DIM preview
vercel env add EMBEDDINGS_MODEL preview
```

### 5.3 Conferir env vars cadastradas
```bash
vercel env ls
```

---

## 6) Configurar Cron Jobs (Vercel Cron)

### 6.1 vercel.json (exemplo)
Na raiz do repo, `vercel.json` deve conter algo como:
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

- `schedule` equivalente a **a cada 2 horas**
- `path` deve corresponder a um endpoint real exposto pelo backend

> Qualquer alteração em `vercel.json` exige novo deploy para aplicar.

---

## 7) Deploy de Preview (recomendado antes do PROD)

### 7.1 Deploy preview
```bash
vercel deploy
```

No final, você receberá uma URL de preview (ex.: `https://<projeto>-<hash>.vercel.app`).

### 7.2 Validar endpoints essenciais
- **Frontend**: abra a URL no navegador
- **Backend health**:
  ```bash
  curl -i https://<URL_PREVIEW>/api/health
  ```

Se o projeto não tiver `/api/health`, valide um endpoint básico equivalente.

---

## 8) Deploy em Produção

### 8.1 Deploy prod
```bash
vercel deploy --prod
```

### 8.2 Validar produção
```bash
curl -i https://<DOMINIO_PROD>/api/health
```

---

## 9) Rodar migrations no Vercel Postgres (pós-deploy)

**Importante:** Vercel não roda automaticamente seus scripts de migration a menos que você tenha criado um fluxo específico.
O padrão operacional recomendado é: **executar migrations manualmente** quando necessário (com controle e janela).

### 9.1 Rodar migrations localmente apontando para o banco de produção
Copie a `DATABASE_URL` do Vercel Postgres e rode:

#### Windows PowerShell
```powershell
$env:DATABASE_URL="postgres://..."
python backend\database\run_migrations.py
```

#### macOS/Linux
```bash
export DATABASE_URL="postgres://..."
python backend/database/run_migrations.py
```

### 9.2 Seed (opcional)
Se seu ambiente precisa de seed (ex.: instrumentos):
#### Windows PowerShell
```powershell
$env:DATABASE_URL="postgres://..."
python backend\database\seed_data.py
```

#### macOS/Linux
```bash
export DATABASE_URL="postgres://..."
python backend/database/seed_data.py
```

---

## 10) Validar Cron Job

### 10.1 Disparo manual do cron
```bash
curl -i -X POST https://<DOMINIO_PROD>/api/cron/research
```

### 10.2 Onde ver logs do cron
- **Vercel Dashboard → Project → Functions → Logs**
- Filtre pelo caminho `/api/cron/research`

---

## 11) Logs, troubleshooting e operações comuns

### 11.1 Ver logs via CLI
```bash
vercel logs https://<DOMINIO_PROD> --since 1h
```

### 11.2 Problemas comuns

#### A) `500 Internal Server Error`
Checklist:
- `vercel env ls` confirma env vars?
- `DATABASE_URL` válida?
- Logs da Function mostram stack trace?
- Se for embedding: `OPENAI_API_KEY` OK? quota OK?

#### B) Cron não roda
Checklist:
- `vercel.json` contém `crons`?
- Deploy mais recente incluiu `vercel.json`?
- Endpoint `/api/cron/research` responde manualmente?
- Logs aparecem no dashboard?

#### C) Timeout em execução
Ações:
- Reduzir volume de trabalho por execução do cron
- Tornar o job incremental / idempotente
- Quebrar em múltiplos crons (`/api/cron/step-1`, `/api/cron/step-2`, etc.)

#### D) Erro de conexão com DB
Checklist:
- `DATABASE_URL` está correta e sem caracteres escondidos
- Banco está ativo no Storage (Dashboard)
- Migrations aplicadas

---

## 12) Checklist final (go-live)

- [ ] `vercel deploy --prod` concluído sem erros
- [ ] `DATABASE_URL` configurada em **production**
- [ ] `OPENAI_API_KEY` configurada em **production**
- [ ] Migrations aplicadas no banco de produção
- [ ] `/api/health` retorna `200`
- [ ] Frontend acessa `/api/*` no mesmo domínio
- [ ] Cron endpoint responde manualmente (200)
- [ ] Logs sem erros críticos

---

## 13) Comandos rápidos (resumo)

```bash
# login + link
vercel login
vercel link

# env vars
vercel env add DATABASE_URL production
vercel env add OPENAI_API_KEY production
vercel env add EMBEDDING_DIM production

# deploy
vercel deploy
vercel deploy --prod

# logs
vercel logs https://<dominio> --since 1h

# validar cron
curl -X POST https://<dominio>/api/cron/research
```

---

## 14) Notas de segurança
- Nunca commitar `.env.local`
- Nunca logar `DATABASE_URL` ou `OPENAI_API_KEY`
- Rotacionar a chave `OPENAI_API_KEY` periodicamente

---

*Documento gerado para o stack final Vercel-first.*
