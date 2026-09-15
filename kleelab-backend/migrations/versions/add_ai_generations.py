"""add ai generations ledger

Revision ID: add_ai_generations
Revises: add_user_plan
Create Date: 2026-09-15 00:00:00.000000

One row per outbound model call. Serves the monthly build allowance and the cost
trail from the same data, so a quota can never disagree with what was actually
spent.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "add_ai_generations"
down_revision = "add_user_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_generations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("model", sa.String(length=50), nullable=False),
        sa.Column("prompt_chars", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ok"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        # SET NULL, not CASCADE: deleting a site must not erase the record of the
        # spend that built it.
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_generations_user_kind_created",
        "ai_generations",
        ["user_id", "kind", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_generations_user_kind_created", table_name="ai_generations")
    op.drop_table("ai_generations")
