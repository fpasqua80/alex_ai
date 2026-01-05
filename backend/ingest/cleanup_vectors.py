from __future__ import annotations
import argparse, json
from backend.vectorstore.pgvector_store import delete_by_index, DEFAULT_INDEX

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--index", default=DEFAULT_INDEX)
    args=ap.parse_args()
    deleted=delete_by_index(args.index)
    print(json.dumps({"ok": True, "deleted": deleted, "index": args.index}))
if __name__=='__main__':
    main()
