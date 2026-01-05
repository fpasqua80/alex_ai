#!/usr/bin/env python3
"""scripts/destroy.py

Teardown helpers for the **Vercel** version of the project.

This replaces the previous Terraform destroy + S3/CloudFront invalidation flow.

By default, this script ONLY helps with local teardown.
Deleting Vercel projects is destructive, so it's opt-in via a flag.

Usage:
  # Stop local containers and optionally delete volumes
  python scripts/destroy.py
  python scripts/destroy.py --purge-volumes

  # (DANGEROUS) Remove Vercel project (requires confirmation)
  python scripts/destroy.py --remove-vercel --project <project_name>
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], *, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=str(cwd) if cwd else None, text=True, check=check)


def docker_compose_down(repo_root: Path, purge_volumes: bool) -> None:
    print("\n🐳 Stopping local containers...")
    cmd = ["docker", "compose", "down"]
    if purge_volumes:
        cmd.append("-v")
    try:
        run(cmd, cwd=repo_root)
        print("  ✅ Done")
    except subprocess.CalledProcessError:
        print("  ⚠️  docker compose down failed (maybe docker isn't running or compose file not found).")


def remove_vercel_project(project: str) -> None:
    print("\n🧨 Removing Vercel project (destructive)...")
    print(f"Project: {project}")
    print("You will be prompted by Vercel CLI. Make sure you REALLY want this.")
    try:
        run(["vercel", "projects", "rm", project], check=True)
        print("  ✅ Project removed")
    except subprocess.CalledProcessError:
        print("  ❌ Failed to remove project. Ensure Vercel CLI is installed and you have permissions.")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--purge-volumes", action="store_true", help="Also remove docker volumes (-v)")
    parser.add_argument("--remove-vercel", action="store_true", help="(Destructive) Remove the Vercel project")
    parser.add_argument("--project", type=str, default="", help="Vercel project name (required with --remove-vercel)")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]

    print("🧹 Teardown")
    print("=" * 56)

    docker_compose_down(repo_root, args.purge_volumes)

    if args.remove_vercel:
        if not args.project:
            print("❌ --project is required when using --remove-vercel")
            sys.exit(1)
        remove_vercel_project(args.project)

    print("\n✅ Done")


if __name__ == "__main__":
    main()
