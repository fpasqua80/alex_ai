#!/usr/bin/env python3
"""
Trigger the Researcher service without AWS Lambda.

Usage:
  python trigger_research.py --url https://<researcher-service>/research/auto
  python trigger_research.py --url http://localhost:8001/research/auto

If --url is omitted, it uses RESEARCHER_URL env var.
"""
import os
import json
import argparse
import urllib.request


def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read().decode("utf-8")
        return {"status": resp.status, "body": body}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=os.getenv("RESEARCHER_URL", "").strip())
    ap.add_argument("--topic", default="market_update")
    ap.add_argument("--symbol", default=None)
    args = ap.parse_args()

    if not args.url:
        raise SystemExit("ERROR: Provide --url or set RESEARCHER_URL env var.")

    payload = {"topic": args.topic}
    if args.symbol:
        payload["symbol"] = args.symbol

    result = post_json(args.url, payload)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
