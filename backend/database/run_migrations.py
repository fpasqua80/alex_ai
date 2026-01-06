#!/usr/bin/env python3
"""
Run database migrations against Postgres using DATABASE_URL.
Compatible with Vercel Postgres and local Postgres.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

from backend.database.src.client import PostgresClient

load_dotenv(override=False)  # do not override existing env vars

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _split_sql(sql: str):
    """
    Split a SQL file into executable statements.

    Handles:
    - ; statement terminators (only when not inside quotes)
    - single quotes: '...'
    - double quotes: "..."
    - dollar-quoted strings/functions: $$...$$ or $tag$...$tag$
    - line comments: -- ...
    - block comments: /* ... */
    """

    sql = sql.replace("\ufeff", "")  # strip BOM if present

    statements = []
    buf = []

    in_single = False
    in_double = False
    dollar_delim = None

    i = 0
    n = len(sql)

    def flush():
        s = "".join(buf).strip()
        if s:
            statements.append(s)
        buf.clear()

    while i < n:
        ch = sql[i]

        # Inside dollar-quoted block
        if dollar_delim is not None:
            if sql.startswith(dollar_delim, i):
                buf.append(dollar_delim)
                i += len(dollar_delim)
                dollar_delim = None
                continue
            buf.append(ch)
            i += 1
            continue

        # Inside single-quoted string
        if in_single:
            buf.append(ch)
            if ch == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    buf.append("'")
                    i += 2
                    continue
                in_single = False
            i += 1
            continue

        # Inside double-quoted string
        if in_double:
            buf.append(ch)
            if ch == '"':
                in_double = False
            i += 1
            continue

        # Line comment
        if ch == "-" and i + 1 < n and sql[i + 1] == "-":
            i += 2
            while i < n and sql[i] not in "\r\n":
                i += 1
            continue

        # Block comment
        if ch == "/" and i + 1 < n and sql[i + 1] == "*":
            i += 2
            while i + 1 < n and not (sql[i] == "*" and sql[i + 1] == "/"):
                i += 1
            i += 2
            continue

        # Start single quote
        if ch == "'":
            in_single = True
            buf.append(ch)
            i += 1
            continue

        # Start double quote
        if ch == '"':
            in_double = True
            buf.append(ch)
            i += 1
            continue

        # Start dollar-quote
        if ch == "$":
            j = i + 1
            while j < n and sql[j] != "$" and (sql[j].isalnum() or sql[j] == "_"):
                j += 1
            if j < n and sql[j] == "$":
                dollar_delim = sql[i : j + 1]
                buf.append(dollar_delim)
                i = j + 1
                continue

        # Statement terminator
        if ch == ";":
            flush()
            i += 1
            continue

        buf.append(ch)
        i += 1

    flush()
    return statements


def main():
    print("Running database migrations (Postgres)")
    print("=" * 55)

    db = PostgresClient(os.environ.get("DATABASE_URL"))

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        raise SystemExit(f"No migration files found in {MIGRATIONS_DIR}")

    total = 0
    for mf in migration_files:
        print(f"\nProcessing {mf.name}")
        sql = mf.read_text(encoding="utf-8")
        statements = _split_sql(sql)

        for i, stmt in enumerate(statements, start=1):
            try:
                db.execute(stmt)
                total += 1
            except Exception:
                print(f"FAILED on statement {i} in {mf.name}")
                print(stmt[:500])
                raise

    print(f"\nMigrations completed successfully. Executed {total} statements.")


if __name__ == "__main__":
    main()