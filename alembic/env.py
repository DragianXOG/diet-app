import os, sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# Ensure project root is importable (so "import app" works)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Load .env so DATABASE_URL is available
from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

# Import models/metadata
from sqlmodel import SQLModel
import app.models  # registers models with SQLModel.metadata

# Alembic config
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# DB URL from env (Postgres required)
db_url = os.getenv("DATABASE_URL")
if not db_url:
    raise RuntimeError("DATABASE_URL is required for migrations and must point to Postgres.")
if not db_url.startswith("postgres") and not db_url.startswith("postgresql"):
    raise RuntimeError(f"Unsupported database backend in DATABASE_URL: {db_url}")
config.set_main_option("sqlalchemy.url", db_url)

target_metadata = SQLModel.metadata

def run_migrations_offline():
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(
        {"sqlalchemy.url": db_url},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
