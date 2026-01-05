#!/usr/bin/env python3
"""scripts/run_local.py

Run the project locally for development (frontend + backend), using Docker for Postgres.

What this script does:
1) Starts Postgres with `docker compose up -d`
2) Runs migrations (optional flag)
3) Starts FastAPI (uvicorn) and Next.js dev server in parallel
4) Handles Ctrl+C cleanup

Usage:
  python scripts/run_local.py
  python scripts/run_local.py --migrate
  python scripts/run_local.py --no-frontend
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

processes: list[subprocess.Popen] = []


def run(cmd: list[str], *, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=str(cwd) if cwd else None, text=True, check=check)


def start_process(cmd: list[str], cwd: Path) -> subprocess.Popen:
    p = subprocess.Popen(cmd, cwd=str(cwd))
    processes.append(p)
    return p


def cleanup(*_args) -> None:
    print("\n\n🧹 Shutting down...")
    for p in processes:
        if p.poll() is None:
            try:
                p.terminate()
            except Exception:
                pass
    time.sleep(0.5)
    for p in processes:
        if p.poll() is None:
            try:
                p.kill()
            except Exception:
                pass
    print("✅ Stopped")


def ensure_node_npm() -> None:
    try:
        subprocess.run(["node", "--version"], capture_output=True, text=True, check=True)
    except Exception:
        print("❌ Node.js not found. Install Node.js (LTS) and retry.")
        sys.exit(1)
    try:
        subprocess.run(["npm", "--version"], capture_output=True, text=True, check=True)
    except Exception:
        print("❌ npm not found. Install npm and retry.")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--migrate", action="store_true", help="Run DB migrations before starting services")
    parser.add_argument("--no-frontend", action="store_true", help="Start only the backend")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    backend_dir = repo_root / "backend"
    frontend_dir = repo_root / "frontend"  # adjust if your frontend folder has a different name

    print("🧪 Run Local")
    print("=" * 56)
    print(f"Repo root: {repo_root}")

    # Start Postgres
    print("\n🐳 Starting Postgres (docker compose)...")
    try:
        run(["docker", "compose", "up", "-d"], cwd=repo_root)
        print("  ✅ Postgres up")
    except subprocess.CalledProcessError:
        print("  ❌ Failed to start docker compose. Is Docker Desktop running?")
        sys.exit(1)

    if args.migrate:
        print("\n🗄️  Running migrations...")
        try:
            run([sys.executable, "backend/database/run_migrations.py"], cwd=repo_root)
            print("  ✅ Migrations done")
        except subprocess.CalledProcessError:
            print("  ❌ Migrations failed")
            sys.exit(1)

    # Ensure env defaults for local dev
    os.environ.setdefault("NEXT_PUBLIC_API_URL", "http://localhost:8000")

    # Trap signals
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Start backend
    print("\n🚀 Starting backend (uvicorn)...")
    # Adjust module path if your FastAPI app is elsewhere
    backend_cmd = [sys.executable, "-m", "uvicorn", "backend.api.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
    start_process(backend_cmd, cwd=repo_root)

    # Start frontend
    if not args.no_frontend:
        ensure_node_npm()
        if not frontend_dir.exists():
            print(f"\n⚠️  Frontend folder not found at: {frontend_dir}")
            print("    If your frontend directory has a different name, update scripts/run_local.py.")
        else:
            print("\n🌐 Starting frontend (Next.js dev)...")
            # Install deps if needed
            try:
                run(["npm", "install"], cwd=frontend_dir, check=True)
            except subprocess.CalledProcessError:
                print("  ❌ npm install failed")
                cleanup()
                sys.exit(1)
            start_process(["npm", "run", "dev"], cwd=frontend_dir)

    print("\n✅ Running. Press Ctrl+C to stop.")
    while True:
        time.sleep(1)
        # If any process exits, stop all
        for p in processes:
            if p.poll() is not None:
                print("\n⚠️  A process exited. Stopping... ")
                cleanup()
                sys.exit(p.returncode)


if __name__ == "__main__":
    main()
