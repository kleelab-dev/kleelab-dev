"""Add account fields required by registration and account deletion."""

from alembic import op


revision = "add_user_account_fields"
down_revision = "initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50) NOT NULL DEFAULT 'email'")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS deletion_requested_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS provider")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_verified")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_superuser")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_active")
