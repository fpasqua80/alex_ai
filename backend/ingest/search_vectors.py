from __future__ import annotations
import argparse, json, asyncio
from backend.embeddings.provider import embed
from backend.vectorstore.pgvector_store import query_similar, DEFAULT_INDEX

async def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--query", required=True)
    ap.add_argument("--top-k", type=int, default=3)
    ap.add_argument("--index", default=DEFAULT_INDEX)
    args=ap.parse_args()
    qvec=await embed(args.query)
    res=query_similar(index_name=args.index, query_embedding=qvec, top_k=args.top_k)
    print(json.dumps({"ok": True, "results": res}, ensure_ascii=False, indent=2))

if __name__=='__main__':
    asyncio.run(main())
