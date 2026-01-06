"""
Database models and query builders
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from decimal import Decimal

from .client import PostgresClient
from .schemas import (
    InstrumentCreate,
)


class BaseModel:
    """
    Base class for database models.
    IMPORTANT:
    - Does NOT assume every table has an `id`
    - RETURNING must be explicitly provided
    """

    table_name = None

    def __init__(self, db: PostgresClient):
        self.db = db
        if not self.table_name:
            raise ValueError("table_name must be defined")

    def find_by_id(self, id: Any) -> Optional[Dict]:
        sql = f"SELECT * FROM {self.table_name} WHERE id = :id::uuid"
        return self.db.query_one(
            sql, [{"name": "id", "value": {"stringValue": str(id)}}]
        )

    def find_all(self, limit: int = 100, offset: int = 0) -> List[Dict]:
        sql = f"SELECT * FROM {self.table_name} LIMIT :limit OFFSET :offset"
        params = [
            {"name": "limit", "value": {"longValue": limit}},
            {"name": "offset", "value": {"longValue": offset}},
        ]
        return self.db.query(sql, params)

    def create(self, data: Dict, returning: Optional[str] = None):
        """
        Create a new record.
        If returning is None, no RETURNING clause is used.
        """
        return self.db.insert(self.table_name, data, returning=returning)

    def update(self, id: Any, data: Dict) -> int:
        return self.db.update(
            self.table_name,
            data,
            "id = :id::uuid",
            {"id": str(id)},
        )

    def delete(self, id: Any) -> int:
        return self.db.delete(
            self.table_name,
            "id = :id::uuid",
            {"id": str(id)},
        )


# =========================
# USERS
# =========================




class Users(BaseModel):
    table_name = "users"

    def find_by_clerk_id(self, clerk_user_id: str) -> Optional[Dict]:
        sql = f"SELECT * FROM {self.table_name} WHERE clerk_user_id = :clerk_id"
        params = [{"name": "clerk_id", "value": {"stringValue": clerk_user_id}}]
        return self.db.query_one(sql, params)

    def create_user(
        self,
        clerk_user_id: str,
        display_name: Optional[str] = None,
        years_until_retirement: Optional[int] = None,
        target_retirement_income: Optional[Decimal] = None,
    ) -> str:
        data = {
            "clerk_user_id": clerk_user_id,
            "display_name": display_name,
            "years_until_retirement": years_until_retirement,
            "target_retirement_income": target_retirement_income,
        }
        data = {k: v for k, v in data.items() if v is not None}
        return self.db.insert(self.table_name, data, returning="clerk_user_id")


# =========================
# INSTRUMENTS
# =========================

class Instruments(BaseModel):
    table_name = "instruments"

    def find_all(self) -> List[Dict]:
        sql = f"SELECT * FROM {self.table_name} ORDER BY symbol"
        return self.db.query(sql)

    def find_by_symbol(self, symbol: str) -> Optional[Dict]:
        sql = f"SELECT * FROM {self.table_name} WHERE symbol = :symbol"
        params = [{"name": "symbol", "value": {"stringValue": symbol}}]
        return self.db.query_one(sql, params)

    def create_instrument(self, instrument: InstrumentCreate) -> str:
        validated = instrument.model_dump()
        data = {
            "symbol": validated["symbol"],
            "name": validated["name"],
            "instrument_type": validated["instrument_type"],
            "current_price": validated.get("current_price"),
            "allocation_regions": validated["allocation_regions"],
            "allocation_sectors": validated["allocation_sectors"],
            "allocation_asset_class": validated["allocation_asset_class"],
        }
        return self.db.insert(self.table_name, data, returning="symbol")


# =========================
# ACCOUNTS
# =========================

class Accounts(BaseModel):
    table_name = "accounts"

    def find_by_user(self, clerk_user_id: str) -> List[Dict]:
        sql = f"""
            SELECT * FROM {self.table_name}
            WHERE clerk_user_id = :user_id
            ORDER BY created_at DESC
        """
        params = [{"name": "user_id", "value": {"stringValue": clerk_user_id}}]
        return self.db.query(sql, params)

    def create_account(
        self,
        clerk_user_id: str,
        account_name: str,
        account_purpose: Optional[str] = None,
        cash_balance: Decimal = Decimal("0"),
        cash_interest: Decimal = Decimal("0"),
    ) -> str:
        data = {
            "clerk_user_id": clerk_user_id,
            "account_name": account_name,
            "account_purpose": account_purpose,
            "cash_balance": cash_balance,
            "cash_interest": cash_interest,
        }
        return self.db.insert(self.table_name, data, returning="id")


# =========================
# POSITIONS
# =========================


    def delete_account(self, clerk_user_id: str, account_id: str) -> int:
        """
        Delete an account owned by the given clerk_user_id.
        Returns affected rowcount (0 if not found or not owned by user).
        """
        where = "id = :id::uuid AND clerk_user_id = :clerk_user_id"
        params = {
            "id": str(account_id),
            "clerk_user_id": str(clerk_user_id),
        }
        return self.db.delete(self.table_name, where, params)


class Positions:
    """
    Positions are owned by an account (account_id).
    Authorization is enforced at the API layer by checking that the account belongs to the
    current clerk_user_id, so the positions table does not need a clerk_user_id column.
    """

    def __init__(self, db: PostgresClient):
        self.db = db

    def find_by_id(self, position_id: str) -> Optional[Dict]:
        sql = """
            SELECT *
            FROM positions
            WHERE id = :position_id::uuid
            LIMIT 1
        """
        params = [{"name": "position_id", "value": {"stringValue": str(position_id)}}]
        return self.db.query_one(sql, params)

    def add_position(
        self,
        account_id: str,
        symbol: str,
        quantity: Any,
        as_of_date: Optional[str] = None,
    ) -> Optional[str]:
        sql = """
            INSERT INTO positions (
                account_id,
                symbol,
                quantity,
                as_of_date
            )
            VALUES (
                :account_id::uuid,
                :symbol,
                :quantity,
                COALESCE(:as_of_date::date, CURRENT_DATE)
            )
            RETURNING id
        """
        params = [
            {"name": "account_id", "value": {"stringValue": str(account_id)}},
            {"name": "symbol", "value": {"stringValue": str(symbol)}},
            {"name": "quantity", "value": {"stringValue": str(quantity)}},
            {"name": "as_of_date", "value": {"stringValue": str(as_of_date)} if as_of_date else {"isNull": True}},
        ]
        row = self.db.query_one(sql, params)
        return str(row["id"]) if row and "id" in row else None

    def list_by_account(self, account_id: str) -> List[Dict]:
        sql = """
            SELECT *
            FROM positions
            WHERE account_id = :account_id::uuid
            ORDER BY created_at DESC
        """
        params = [{"name": "account_id", "value": {"stringValue": str(account_id)}}]
        return self.db.query(sql, params)

    def delete_position(self, position_id: str) -> bool:
        sql = """
            DELETE FROM positions
            WHERE id = :position_id::uuid
        """
        params = [{"name": "position_id", "value": {"stringValue": str(position_id)}}]
        self.db.execute(sql, params)
        return True

class Jobs(BaseModel):
    table_name = "jobs"

    def create_job(
        self,
        clerk_user_id: str,
        job_type: str,
        request_payload: Optional[Dict] = None,
    ) -> str:
        data = {
            "clerk_user_id": clerk_user_id,
            "job_type": job_type,
            "status": "pending",
            "request_payload": request_payload,
        }
        return self.db.insert(self.table_name, data, returning="id")

    def update_status(
        self,
        job_id: str,
        status: str,
        error_message: Optional[str] = None,
    ) -> int:
        data = {"status": status}
        if status == "running":
            data["started_at"] = datetime.utcnow()
        if status in ("completed", "failed"):
            data["completed_at"] = datetime.utcnow()
        if error_message:
            data["error_message"] = error_message

        return self.db.update(
            self.table_name,
            data,
            "id = :id::uuid",
            {"id": job_id},
        )


# =========================
# DATABASE FACADE
# =========================

class Database:
    def __init__(self):
        self.client = PostgresClient()
        self.users = Users(self.client)
        self.instruments = Instruments(self.client)
        self.accounts = Accounts(self.client)
        self.positions = Positions(self.client)
        self.jobs = Jobs(self.client)
