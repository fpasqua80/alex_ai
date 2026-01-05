"""
Vercel entrypoint.

Vercel maps files under /api to serverless routes. For ASGI apps, exposing a
module-level `app` (FastAPI) is enough.

This app lives in backend/api/main.py.
"""

from backend.api.main import app
