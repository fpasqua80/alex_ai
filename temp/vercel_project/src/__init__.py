"""
Compatibility shim.

Older code imported `src` as the database package. For Vercel + the new layout,
the database package lives at `backend.database.src`.

New code should import from `backend.database.src`.
"""
from backend.database.src import *  # noqa
