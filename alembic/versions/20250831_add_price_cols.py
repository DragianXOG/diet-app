# alembic/versions/20250831_add_price_cols.py
from alembic import op
import sqlalchemy as sa

# Set these appropriately
revision = "20250831_add_price_cols"
down_revision = "<PUT_YOUR_LAST_REVISION_ID>"
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("grocery_items")}
    if "store" not in cols:
        op.add_column("grocery_items", sa.Column("store", sa.String(length=60), nullable=True))
    if "unit_price" not in cols:
        op.add_column("grocery_items", sa.Column("unit_price", sa.Float(), nullable=True))
    if "total_price" not in cols:
        op.add_column("grocery_items", sa.Column("total_price", sa.Float(), nullable=True))

def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("grocery_items")}
    if "total_price" in cols:
        op.drop_column("grocery_items", "total_price")
    if "unit_price" in cols:
        op.drop_column("grocery_items", "unit_price")
    if "store" in cols:
        op.drop_column("grocery_items", "store")
