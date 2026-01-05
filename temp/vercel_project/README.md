# Alex backend on Vercel

## Vector store (pgvector) + Embeddings

AWS S3 Vectors + SageMaker were replaced with Vercel Postgres (pgvector) and OpenAI-compatible embeddings.

Env vars:
- DATABASE_URL (from Vercel Postgres)
- OPENAI_API_KEY
- EMBEDDING_DIM / EMBEDDINGS_DIMENSIONS (default 1024)

Ingest:
- `python backend/ingest/ingest_vectors.py --text "..."`
Search:
- `python backend/ingest/search_vectors.py --query "..."`
Cleanup:
- `python backend/ingest/cleanup_vectors.py`
