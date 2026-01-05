# Infra Migration: Terraform (AWS) -> Vercel

Este diretório substitui a infraestrutura antiga em Terraform/AWS por **configuração e operação na Vercel**.

## O que mudou (mapeamento direto)

| Terraform / AWS | O que era | Vercel (novo) |
|---|---|---|
| `aws_cloudfront_distribution` + `aws_s3_bucket_*` | Frontend estático + CDN | Deploy do Next.js direto na Vercel (CDN automática) |
| `aws_apigatewayv2_*` / `aws_api_gateway_*` | API Gateway | Rotas serverless na Vercel (`/api/*`) |
| `aws_lambda_function` / `lambda_handler` | Execução serverless | Vercel Serverless Functions (FastAPI entry em `api/index.py`) |
| `aws_scheduler_schedule` (`rate(2 hours)`) | Scheduler/EventBridge | **Vercel Cron** (`vercel.json`) |
| `aws_sagemaker_*` | Endpoint de embeddings | Embeddings via **OpenAI-compatible API** (env vars) |
| `aws_s3_bucket` (vectors/docs) | Armazenamento e vetores em S3 | **Vercel Postgres + pgvector** |
| `aws_sqs_queue` | fila para jobs | Removido (pipeline in-process + crons). Se precisar, pode migrar para fila externa futuramente |
| `aws_secretsmanager_*` | segredos | Vercel Environment Variables |

## Arquivos principais

- `vercel.json`: cron jobs e comportamento da Vercel
- `.env.example`: variáveis de ambiente necessárias
- `scripts/vercel_setup.ps1`: script para linkar projeto, setar env vars e fazer deploy

## Como aplicar (Windows PowerShell)

1) Instale e logue no Vercel CLI:
```powershell
npm i -g vercel
vercel login
```

2) No diretório do repositório, copie os arquivos deste diretório para a raiz do projeto:
- `vercel.json`
- `.env.example`
- `scripts/vercel_setup.ps1`

3) Rode o setup:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\vercel_setup.ps1
```

> Para configurar **Preview env vars** em vez de Production, use:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\vercel_setup.ps1 -Preview
```

## Vercel Postgres

- Crie o banco em: Vercel Dashboard → Storage → Postgres
- Copie a `DATABASE_URL` (ou `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`) para `DATABASE_URL`

## Crons

O cron equivalente ao `rate(2 hours)` está em `vercel.json`:

- Path: `/api/cron/research`
- Schedule: `0 */2 * * *`

**Validação manual:**
```bash
curl -X POST https://<seu-dominio>/api/cron/research
```

## Domínios e HTTPS

Na Vercel:
- Project → Settings → Domains
- A Vercel provisiona HTTPS automaticamente.

## O que NÃO existe mais

- `terraform apply`
- IAM policies
- VPC/Security Groups
- API keys do API Gateway

Tudo passa a ser controlado por:
- Deploy na Vercel
- Env Vars
- Vercel Postgres
- Vercel Cron
