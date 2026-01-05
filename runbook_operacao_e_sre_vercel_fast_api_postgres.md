# RUNBOOK – Operação e SRE

Este runbook descreve **procedimentos operacionais**, **diagnóstico de incidentes** e **boas práticas de SRE** para o backend baseado em **Vercel + FastAPI + Vercel Postgres + Vercel Cron**.

Este documento é destinado a **SREs, DevOps e times de operação**.

---

## 1. Visão Geral do Sistema

### Stack

- **Plataforma**: Vercel (Serverless Functions)
- **API**: FastAPI
- **Banco**: Vercel Postgres (PostgreSQL + pgvector)
- **Agendamentos**: Vercel Cron
- **Embeddings**: API OpenAI-compatible

### Componentes Críticos

| Componente | Impacto |
|----------|--------|
| API FastAPI | Alto |
| Vercel Cron | Alto |
| Vercel Postgres | Crítico |
| API de Embeddings | Médio/Alto |

---

## 2. Observabilidade

### Logs

- Logs da API e Crons ficam disponíveis em:
  - **Vercel Dashboard → Functions → Logs**

Boas práticas:
- Sempre logar início e fim de jobs de cron
- Logar tempo de execução
- Logar exceções com stack trace

---

## 3. Incidentes Comuns e Resolução

### 3.1 Cron não executa

**Sintomas**:
- Nenhum log recente do cron
- Dados não atualizados

**Diagnóstico**:
1. Verificar `vercel.json`
2. Conferir path do cron (`/api/cron/research`)
3. Validar se o deploy mais recente incluiu o cron
4. Executar manualmente o endpoint via `curl`

**Correção**:
- Redeploy do projeto
- Corrigir path ou schedule

---

### 3.2 Cron executa mas falha

**Sintomas**:
- Logs mostram erro 500

**Diagnóstico**:
- Conferir variáveis de ambiente
- Verificar timeout (>60s)
- Checar falhas de conexão com banco ou embeddings

**Correção**:
- Quebrar job em etapas menores
- Reduzir carga por execução

---

### 3.3 Erro de conexão com Postgres

**Sintomas**:
- Erros `connection refused` ou `timeout`

**Diagnóstico**:
- Verificar status do Vercel Postgres
- Conferir `DATABASE_URL`
- Testar conexão local

**Correção**:
- Redeploy
- Recriar conexão pool

---

### 3.4 Falha de Embeddings

**Sintomas**:
- Erros ao gerar vetores

**Diagnóstico**:
- Conferir `OPENAI_API_KEY`
- Verificar limites da API
- Checar `EMBEDDING_DIM`

**Correção**:
- Rotacionar chave
- Ajustar modelo ou dimensão

---

## 4. Procedimentos Operacionais

### 4.1 Executar Cron Manualmente

```bash
curl -X POST https://<dominio>/api/cron/research
```

---

### 4.2 Rodar Migrations em Produção

> ⚠️ Executar apenas em janelas controladas

```bash
python backend/database/run_migrations.py
```

---

### 4.3 Reset de Dados (Ambiente NÃO produção)

```bash
python backend/database/reset_db.py --with-test-data
```

---

## 5. Segurança Operacional

- Nunca expor `.env`
- Nunca logar segredos
- Rotacionar chaves de API
- Restringir acesso ao dashboard da Vercel

---

## 6. Escalabilidade e Performance

### Limites Vercel

- Timeout de funções (Edge/Serverless)
- Execução paralela limitada

Boas práticas:
- Jobs idempotentes
- Paginação de dados
- Vetores particionados por fonte/tenant

---

## 7. Backup e Recuperação

- Vercel Postgres realiza backups automáticos
- Para restore:
  - Criar novo banco
  - Aplicar migrations
  - Reprocessar ingestão se necessário

---

## 8. Checklist de Incidente (SRE)

- [ ] Identificar componente afetado
- [ ] Verificar logs na Vercel
- [ ] Validar variáveis de ambiente
- [ ] Executar endpoint manualmente
- [ ] Mitigar impacto (desativar cron, reduzir carga)
- [ ] Aplicar correção
- [ ] Post-mortem

---

## 9. Post-mortem (Template)

- **Resumo**:
- **Impacto**:
- **Causa raiz**:
- **Ação corretiva**:
- **Ação preventiva**:

---

## 10. Referências

- Vercel Docs
- FastAPI Docs
- PostgreSQL / pgvector Docs

---

Este runbook deve ser revisado periodicamente conforme o sistema evolui.

