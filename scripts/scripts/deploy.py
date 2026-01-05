#!/usr/bin/env python3
"""scripts/deploy.py

Deploy to **Vercel** (API + Frontend) using the Vercel CLI.

This replaces the previous AWS/Terraform/S3/CloudFront deployment flow.

What this script does:
1) Validates local tooling (node/npm, vercel)
2) Ensures you're logged in to Vercel
3) Runs `vercel deploy --prod` from the repo root
4) Prints post-deploy reminders (env vars, DB migrations, cron)

Notes:
- Vercel Postgres is managed in Vercel. You typically create/link it in the Vercel UI.
- This script does NOT create databases automatically (to avoid relying on changing CLI commands).
- If your build uses environment variables, set them in: Vercel Project → Settings → Environment Variables.

Usage:
  python scripts/deploy.py
  python scripts/deploy.py --preview
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], *, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=str(cwd) if cwd else None, text=True, check=check)


def check_requirements() -> None:
    print("\n🔎 Checking requirements...")

    # Node
    try:
        out = subprocess.run(["node", "--version"], capture_output=True, text=True, check=True).stdout.strip()
        print(f"  ✅ Node.js: {out}")
    except Exception:
        print("  ❌ Node.js not found. Install Node.js (LTS) and retry.")
        sys.exit(1)

    # npm
    try:
        out = subprocess.run(["npm", "--version"], capture_output=True, text=True, check=True).stdout.strip()
        print(f"  ✅ npm: {out}")
    except Exception:
        print("  ❌ npm not found. Install npm (comes with Node.js) and retry.")
        sys.exit(1)

    # Vercel CLI
    try:
        out = subprocess.run(["vercel", "--version"], capture_output=True, text=True, check=True).stdout.strip()
        print(f"  ✅ Vercel CLI: {out}")
    except Exception:
        print("  ❌ Vercel CLI not found. Install with: npm i -g vercel")
        sys.exit(1)


def ensure_vercel_login() -> None:
    print("\n🔐 Verifying Vercel auth...")
    # `vercel whoami` returns non-zero if not logged in
    try:
        out = subprocess.run(["vercel", "whoami"], capture_output=True, text=True, check=True).stdout.strip()
        print(f"  ✅ Logged in as: {out}")
    except subprocess.CalledProcessError:
        print("  ❌ Not logged in to Vercel. Run: vercel login")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true", help="Deploy as preview instead of production")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]  # repo_root/scripts/deploy.py
    print("🚀 Vercel Deploy")
    print("=" * 56)
    print(f"Repo root: {repo_root}")

    check_requirements()
    ensure_vercel_login()

    print("\n📦 Deploying...")

    # Vercel deploy uses the configured project (via .vercel) or prompts the first time.
    cmd = ["vercel", "deploy"]
    if not args.preview:
        cmd.append("--prod")

    try:
        result = subprocess.run(cmd, cwd=str(repo_root), text=True, check=True, capture_output=True)
        output = result.stdout.strip()
        # The last line usually contains the deployment URL
        deploy_url = output.splitlines()[-1] if output else ""
        print("\n✅ Deploy completed")
        if deploy_url:
            print(f"\n🌐 Deployment URL: {deploy_url}")
    except subprocess.CalledProcessError as e:
        print("\n❌ Deploy failed")
        if e.stdout:
            print(e.stdout)
        if e.stderr:
            print(e.stderr, file=sys.stderr)
        sys.exit(1)

    print("\n🧩 Post-deploy checklist")
    print("- Ensure env vars are set in Vercel:")
    print("  - DATABASE_URL (Vercel Postgres)")
    print("  - OPENAI_API_KEY")
    print("  - EMBEDDING_DIM / EMBEDDINGS_MODEL (if used)")
    print("- Run DB migrations against production DATABASE_URL (recommended via CI):")
    print("  python backend/database/run_migrations.py")
    print("- Confirm cron is active in vercel.json and the endpoint works:")
    print("  POST /api/cron/research")


if __name__ == "__main__":
    main()
