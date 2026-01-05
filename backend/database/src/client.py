"""
Database client wrapper.

Originally this project used the AWS Aurora Serverless v2 **RDS Data API** (boto3 rds-data)
with parameters formatted like:

    sql = "SELECT * FROM users WHERE id = :id::uuid"
    params = [{"name": "id", "value": {"stringValue": "..."}}]

For Vercel (Vercel Postgres) and standard Postgres connections, we replace the Data API with a
direct Postgres connection while keeping a compatible call surface so the rest of the codebase
keeps working with minimal changes.

Environment:
    DATABASE_URL   Required. Standard Postgres connection string.
"""

from __future__ import annotations

import os
import re
import json
import logging
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Optional dotenv (only for local dev). In Docker/Vercel, env vars are already set.
try:
    from dotenv import load_dotenv  # type: ignore
except Exception:
    load_dotenv = None  # type: ignore


# Load .env if present (local dev) - DO NOT override env vars coming from Docker/Vercel.
# This prevents DATABASE_URL from being overwritten to localhost inside containers.
if load_dotenv is not None and not os.getenv("DATABASE_URL"):
    load_dotenv(override=False)

# psycopg2 is the most widely supported option on serverless runtimes
try:
    import psycopg2
    import psycopg2.extras
except Exception as e:  # pragma: no cover
    psycopg2 = None
    logger.warning("psycopg2 not available: %s", e)


_PARAM_RE = re.compile(r"(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)")


def _value_from_data_api_param(value: Dict[str, Any]) -> Any:
    """
    Convert a Data-API style value dict to a Python value.
    Example: {"stringValue": "abc"} -> "abc"
    """
    if value is None:
        return None
    if not isinstance(value, dict):
        return value

    # Single-key typed values (Data API)
    if "isNull" in value and value["isNull"]:
        return None
    if "stringValue" in value:
        return value["stringValue"]
    if "longValue" in value:
        return int(value["longValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "booleanValue" in value:
        return bool(value["booleanValue"])
    if "blobValue" in value:
        return value["blobValue"]

    # Array values
    if "arrayValue" in value:
        arr = value["arrayValue"]
        # Data API can represent arrays in a few shapes; support common ones.
        if isinstance(arr, dict):
            if "stringValues" in arr:
                return list(arr["stringValues"])
            if "longValues" in arr:
                return [int(x) for x in arr["longValues"]]
            if "doubleValues" in arr:
                return [float(x) for x in arr["doubleValues"]]
            if "booleanValues" in arr:
                return [bool(x) for x in arr["booleanValues"]]
            if "values" in arr:
                return [_value_from_data_api_param(v) for v in arr["values"]]
        return arr

    # Struct / JSON fallback
    if "stringValue" not in value and len(value) == 1:
        # unknown typed key
        return next(iter(value.values()))

    return value


def _coerce_outgoing(v: Any) -> Any:
    """Coerce Python values to types psycopg2 can handle."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v
    if isinstance(v, (dict, list)):
        # store as JSON
        return json.dumps(v)
    return v


def _convert_sql(sql: str) -> str:
    """
    Convert :name parameters to %(name)s, leaving casts like ::uuid intact.
    """
    return _PARAM_RE.sub(r"%(\1)s", sql)


def _params_to_dict(params: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    if not params:
        return {}
    out: Dict[str, Any] = {}
    for p in params:
        name = p.get("name")
        value = _value_from_data_api_param(p.get("value"))
        out[name] = _coerce_outgoing(value)
    return out


class PostgresClient:
    """
    Postgres-backed replacement for the old Aurora Data API client.
    Exposes query/query_one/execute plus small helpers used by the rest of the code.
    """

    def __init__(self, database_url: Optional[str] = None, *_args, **_kwargs):
        self.database_url = database_url or os.environ.get("DATABASE_URL")
        if not self.database_url:
            raise ValueError("DATABASE_URL is required (Vercel Postgres).")

        if psycopg2 is None:  # pragma: no cover
            raise RuntimeError("psycopg2 is required. Add psycopg2-binary to dependencies.")

    @contextmanager
    def _conn(self):
        conn = psycopg2.connect(self.database_url)
        try:
            yield conn
        finally:
            conn.close()

    def execute(self, sql: str, parameters: Optional[List[Dict[str, Any]]] = None) -> int:
        sql2 = _convert_sql(sql)
        params = _params_to_dict(parameters)
        with self._conn() as conn:
            with conn.cursor() as cur:
                # psycopg2 raises "TypeError: dict is not a sequence" if we pass an empty dict
                # to a statement with no placeholders. For DDL migrations, parameters are usually empty.
                if not params and "%(" not in sql2:
                    cur.execute(sql2)
                else:
                    cur.execute(sql2, params)
                conn.commit()
                return cur.rowcount

    def query(self, sql: str, parameters: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        sql2 = _convert_sql(sql)
        params = _params_to_dict(parameters)
        with self._conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                if not params and "%(" not in sql2:
                    cur.execute(sql2)
                else:
                    cur.execute(sql2, params)
                rows = cur.fetchall()
                return [dict(r) for r in rows]

    def query_one(self, sql: str, parameters: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
        rows = self.query(sql, parameters)
        return rows[0] if rows else None

    # --- Helpers used by models.py -------------------------------------------------

    def insert(self, table: str, data: Dict[str, Any], returning: Optional[str] = None) -> Any:
        cols = list(data.keys())
        placeholders = [f"%({c})s" for c in cols]
        sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(placeholders)})"
        if returning:
            sql += f" RETURNING {returning}"
        vals = {c: _coerce_outgoing(data[c]) for c in cols}
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, vals)
                if returning:
                    ret = cur.fetchone()[0]
                    conn.commit()
                    return ret
                conn.commit()
                return cur.rowcount

    def update(self, table: str, data: Dict[str, Any], where_sql: str, where_params: Dict[str, Any]) -> int:
        set_parts = [f"{k} = %({k})s" for k in data.keys()]
        where_sql2 = _convert_sql(where_sql)
        sql = f"UPDATE {table} SET {', '.join(set_parts)} WHERE {where_sql2}"
        params = {
            **{k: _coerce_outgoing(v) for k, v in data.items()},
            **{k: _coerce_outgoing(v) for k, v in where_params.items()},
        }
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                conn.commit()
                return cur.rowcount


# Backwards-compatible alias: the rest of the code imports DataAPIClient.
DataAPIClient = PostgresClient
