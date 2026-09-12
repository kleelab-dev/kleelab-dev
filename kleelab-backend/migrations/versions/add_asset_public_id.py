"""add asset public_id

Revision ID: add_asset_public_id
Revises: add_refresh_tokens
Create Date: 2026-09-12 00:00:00.000000

Stores the provider-side identifier so an upload can actually be deleted from
Cloudinary. Without it, removing an asset only dropped the database row and left
the file behind forever.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_asset_public_id"
down_revision = "add_refresh_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("public_id", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("assets", "public_id")
