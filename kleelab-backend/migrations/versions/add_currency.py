"""add currency to sites and orders

Revision ID: add_currency
Revises: add_asset_public_id
Create Date: 2026-09-12 00:00:00.000000

Prices were stored as bare numerics with no currency anywhere in the schema, so
no amount was interpretable on its own. `sites.currency` says what a site sells
in; `orders.currency` snapshots it at purchase time so a historical order stays
readable if the site setting later changes.

Existing rows default to GBP, which matches the only storefront data in the
system (none) and the studio's own locale.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_currency"
down_revision = "add_asset_public_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sites",
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="GBP"),
    )
    op.add_column(
        "orders",
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="GBP"),
    )


def downgrade() -> None:
    op.drop_column("orders", "currency")
    op.drop_column("sites", "currency")
