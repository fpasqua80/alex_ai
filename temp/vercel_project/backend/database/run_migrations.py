#!/usr/bin/env python3
"""
Run database migrations against Postgres using DATABASE_URL.

This replaces the old AWS RDS Data API based runner.
Compatible with Vercel Postgres (set DATABASE_URL in Vercel env vars).

Usage (PowerShell):
  uv run backend/database/run_migrations.py
or
  python backend/database/run_migrations.py
"""

import os
from pathlib import Path
from dotenv import load_dotenv

from backend.database.src.client import PostgresClient

load_dotenv(override=True)

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _split_sql(sql: str):
    """
    Very small SQL splitter (good enough for this project's schema files).
    - removes comments lines starting with --
    - splits on ; that end statements
    """
    lines = []
    for line in sql.splitlines():
        if line.strip().startswith("--"):
            continue
        lines.append(line)
    cleaned = "\n".join(lines).strip()
    parts = [p.strip() for p in cleaned.split(";") if p.strip()]
    return parts


def main():
    print("🚀 Running database migrations (Postgres)...")
    print("=" * 55)

    db = PostgresClient(os.environ.get("DATABASE_URL"))

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        raise SystemExit(f"No migration files found in {MIGRATIONS_DIR}")

    total = 0
    for mf in migration_files:
        print(f"\n📄 {mf.name}")
        sql = mf.read_text(encoding="utf-8")
        statements = _split_sql(sql)
        for i, stmt in enumerate(statements, start=1):
            try:
                db.execute(stmt)
                total += 1
            except Exception as e:
                print(f"❌ Failed on statement {i} in {mf.name}")
                print(stmt[:500] + ("..." if len(stmt) > 500 else ""))
                raise

    print(f"\n✅ Migrations completed. Executed {total} statements.")


if __name__ == "__main__":
    main()
