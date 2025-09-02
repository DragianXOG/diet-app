#!/usr/bin/env python3
import os
import shutil
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

def main():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL is required and must be Postgres")
        return
    url = make_url(db_url)
    backend = url.get_backend_name()

    print(f"Using DATABASE_URL={db_url} (backend={backend})")
    if backend != "postgresql" and not backend.startswith("postgres"):
        print("ERROR: This environment is Postgres-only; refusing to operate on non-Postgres backends.")
        return

    # Option A: if SQLite and --drop flag, delete DB file entirely
    import sys
    # Issue DELETEs (Postgres)
    engine = create_engine(db_url, pool_pre_ping=True, future=True)
    with engine.begin() as conn:
        # Order matters for FK (delete children first)
        tables = [
            "meal_items",
            "meals",
            "grocery_items",
            "intakes",
            "users",
        ]
        total = 0
        for t in tables:
            try:
                res = conn.execute(text(f"DELETE FROM {t}"))
                cnt = res.rowcount if res.rowcount is not None else 0
                print(f"DELETE FROM {t}: {cnt}")
                total += cnt or 0
            except Exception as e:
                print(f"WARN: could not delete from {t}: {e}")
        print(f"Total deleted rows (approx): {total}")

    # Clean ancillary files
    repo_root = Path(__file__).resolve().parents[1]
    data_dir = repo_root / "app" / "data"
    plans_dir = repo_root / "data" / "plans"
    prices_dir = repo_root / "data" / "prices"
    intake_json = data_dir / "intake.json"
    for p in [intake_json]:
        try:
            if p.exists():
                print(f"Removing {p}")
                p.unlink()
        except Exception as e:
            print(f"WARN: could not remove {p}: {e}")
    for d in [plans_dir, prices_dir]:
        try:
            if d.exists():
                print(f"Removing directory {d}")
                shutil.rmtree(d)
        except Exception as e:
            print(f"WARN: could not remove {d}: {e}")

    print("✅ Done.")

if __name__ == "__main__":
    main()
