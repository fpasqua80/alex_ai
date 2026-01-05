from __future__ import annotations
import argparse, json, asyncio
from typing import Any, Dict, Optional

from backend.embeddings.provider import embed
from backend.vectorstore.pgvector_store import upsert_document, DEFAULT_INDEX

async def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--title")
    ap.add_argument("--source")
    ap.add_argument("--index", default=DEFAULT_INDEX)
    ap.add_argument("--metadata")
    args=ap.parse_args()

    metadata: Optional[Dict[str, Any]] = json.loads(args.metadata) if args.metadata else None
    vec=await embed(args.text)
    doc_id=upsert_document(index_name=args.index, content=args.text, embedding=vec, title=args.title, source=args.source, metadata=metadata)
    print(json.dumps({"ok": True, "id": doc_id, "index": args.index}, ensure_ascii=False))

if __name__=='__main__':
    asyncio.run(main())
