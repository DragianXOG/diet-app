#!/usr/bin/env python3
"""
Reset the application database (Postgres-only) for a fresh start.

Behavior:
- Postgres only: drops all SQLModel tables and re-creates them (non-app tables are untouched).

Usage:
  python scripts/reset_db.py           # prompts for confirmation
  python scripts/reset_db.py --yes     # no prompt

Reads DATABASE_URL from environment (must be postgresql/postgres).
"""
from __future__ import annotations
import os
import sys
import shutil
from sqlalchemy.engine import make_url
from sqlmodel import SQLModel, create_engine


def log(msg: str) -> None:
    print(f"[reset-db] {msg}")


def confirm(prompt: str) -> bool:
    try:
        ans = input(f"{prompt} [y/N]: ").strip().lower()
        return ans in ("y", "yes")
    except (EOFError, KeyboardInterrupt):
        return False


def recreate_schema(engine) -> None:
    try:
        import app.models  # register models
    except Exception:
        pass
    # Drop then re-create tables known to SQLModel metadata
    try:
        SQLModel.metadata.drop_all(engine)
    except Exception:
        pass
    SQLModel.metadata.create_all(engine)


def reset_postgres(db_url: str) -> None:
    # Use metadata drop/create to avoid affecting non-app tables
    engine = create_engine(db_url, pool_pre_ping=True)
    recreate_schema(engine)
    log("Postgres schema re-created (app tables).")


def main(argv: list[str]) -> int:
    yes = "--yes" in argv or "-y" in argv
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        log("DATABASE_URL is required and must be a Postgres URL")
        return 2
    url = make_url(db_url)
    backend = url.get_backend_name()
    log(f"Using DATABASE_URL={db_url} (backend={backend})")

    if not yes:
        if not confirm("This will ERASE all application data. Continue?"):
            log("aborted by user")
            return 1

    if backend.startswith("postgres"):
        reset_postgres(db_url)
        return 0
    else:
        log(f"Unsupported backend: {backend}. Postgres required.")
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
