"""Embedding provider abstraction (Vercel-friendly).

Default provider: OpenAI-compatible HTTP endpoint (works with OpenAI and compatibles).

Env:
- EMBEDDINGS_PROVIDER: 'openai' (default)
- EMBEDDINGS_MODEL: default 'text-embedding-3-large'
- EMBEDDINGS_DIMENSIONS: default 1024 (must match EMBEDDING_DIM used in pgvector table)
- EMBEDDINGS_API_BASE: default 'https://api.openai.com/v1'
- OPENAI_API_KEY or EMBEDDINGS_API_KEY
"""

from __future__ import annotations

import os
from typing import List

import httpx

PROVIDER = os.getenv("EMBEDDINGS_PROVIDER", "openai")
MODEL = os.getenv("EMBEDDINGS_MODEL", "text-embedding-3-large")
DIMENSIONS = int(os.getenv("EMBEDDINGS_DIMENSIONS", os.getenv("EMBEDDING_DIM", "1024")))
API_BASE = os.getenv("EMBEDDINGS_API_BASE", "https://api.openai.com/v1").rstrip("/")
API_KEY = os.getenv("EMBEDDINGS_API_KEY") or os.getenv("OPENAI_API_KEY")

class EmbeddingError(RuntimeError):
    pass

async def embed(text: str) -> List[float]:
    if PROVIDER != "openai":
        raise EmbeddingError(f"Unsupported EMBEDDINGS_PROVIDER={PROVIDER!r}. Use 'openai'.")
    if not API_KEY:
        raise EmbeddingError("Missing OPENAI_API_KEY (or EMBEDDINGS_API_KEY)")

    url = f"{API_BASE}/embeddings"
    payload = {"model": MODEL, "input": text, "dimensions": DIMENSIONS}
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, json=payload, headers=headers)
        if r.status_code >= 400:
            raise EmbeddingError(f"Embeddings request failed: {r.status_code} {r.text}")
        data = r.json()
        vec = data["data"][0]["embedding"]
        if len(vec) != DIMENSIONS:
            raise EmbeddingError(f"Embedding dim mismatch: got {len(vec)} expected {DIMENSIONS}")
        return vec
