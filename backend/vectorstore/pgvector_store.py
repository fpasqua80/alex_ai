"""Postgres pgvector-backed vector store (Vercel Postgres).

Replaces AWS S3 Vectors usage.
"""

from __future__ import annotations

import os, json, uuid
from typing import Any, Dict, List, Optional, Sequence

import psycopg2
import psycopg2.extras

DEFAULT_INDEX = os.getenv("VECTOR_INDEX_NAME", "financial-research")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1024"))

def _db_url() -> str:
    return (
        os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL_NON_POOLING")
        or os.getenv("POSTGRES_URL")
        or ""
    )

def _connect():
    url = _db_url()
    if not url:
        raise RuntimeError("DATABASE_URL (or POSTGRES_URL*) is not set")
    return psycopg2.connect(url)

def ensure_schema() -> None:
    with _connect() as conn, conn.cursor() as cur:
        cur.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
        cur.execute('CREATE EXTENSION IF NOT EXISTS vector;')
        cur.execute(
            f"""CREATE TABLE IF NOT EXISTS research_vectors (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                index_name TEXT NOT NULL,
                source TEXT,
                title TEXT,
                content TEXT NOT NULL,
                metadata JSONB DEFAULT '{{}}'::jsonb,
                embedding vector({EMBEDDING_DIM}) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );"""
        )
        cur.execute("CREATE INDEX IF NOT EXISTS research_vectors_index_name_idx ON research_vectors(index_name);")
        conn.commit()

def _vector_literal(vec: Sequence[float]) -> str:
    return "[" + ",".join(f"{float(x):.8f}" for x in vec) + "]"

def upsert_document(*, index_name: str = DEFAULT_INDEX, content: str, embedding: Sequence[float],
                    title: Optional[str]=None, source: Optional[str]=None,
                    metadata: Optional[Dict[str, Any]]=None, doc_id: Optional[str]=None) -> str:
    ensure_schema()
    vid = doc_id or str(uuid.uuid4())
    vec_text = _vector_literal(embedding)
    meta = json.dumps(metadata or {})
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(
            f"""INSERT INTO research_vectors (id, index_name, source, title, content, metadata, embedding)
                VALUES (%s::uuid, %s, %s, %s, %s, %s::jsonb, %s::vector({EMBEDDING_DIM}))
                ON CONFLICT (id) DO UPDATE SET
                    index_name=EXCLUDED.index_name,
                    source=EXCLUDED.source,
                    title=EXCLUDED.title,
                    content=EXCLUDED.content,
                    metadata=EXCLUDED.metadata,
                    embedding=EXCLUDED.embedding;""",
            (vid, index_name, source, title, content, meta, vec_text),
        )
        conn.commit()
    return vid

def delete_by_index(index_name: str = DEFAULT_INDEX) -> int:
    ensure_schema()
    with _connect() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM research_vectors WHERE index_name=%s", (index_name,))
        n=cur.rowcount
        conn.commit()
        return n

def query_similar(*, index_name: str = DEFAULT_INDEX, query_embedding: Sequence[float], top_k: int = 3) -> List[Dict[str, Any]]:
    ensure_schema()
    qvec = _vector_literal(query_embedding)
    with _connect() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            f"""SELECT id::text, source, title, content, metadata,
                       1 - (embedding <=> %s::vector({EMBEDDING_DIM})) AS similarity
                FROM research_vectors
                WHERE index_name=%s
                ORDER BY embedding <=> %s::vector({EMBEDDING_DIM})
                LIMIT %s;""",
            (qvec, index_name, qvec, top_k),
        )
        return [dict(r) for r in cur.fetchall()]
