"""files attached to project messages

Revision ID: add_message_attachments
Revises: add_paystack_payments
Create Date: 2026-10-21 00:00:00.000000

- project_files.update_id: the message a file was sent with, if any.
- project_files.held: uploaded for a message that has not been sent yet.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_message_attachments"
down_revision = "add_paystack_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_files",
        sa.Column(
            "update_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("project_updates.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_project_files_update_id", "project_files", ["update_id"])
    op.add_column(
        "project_files", sa.Column("held", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    op.drop_column("project_files", "held")
    op.drop_index("ix_project_files_update_id", table_name="project_files")
    op.drop_column("project_files", "update_id")
