"""
add meals_per_day to intakes

Revision ID: add_meals_per_day_20250901
Revises: e90384c72988
Create Date: 2025-09-01 22:45:13
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_meals_per_day_20250901'
down_revision = 'e90384c72988'
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.add_column('intakes', sa.Column('meals_per_day', sa.Integer(), nullable=True))
    except Exception:
        # If column already exists or table missing in a fresh env, ignore
        pass


def downgrade() -> None:
    try:
        op.drop_column('intakes', 'meals_per_day')
    except Exception:
        pass

