"""enquiry notes and follow-up dates

Revision ID: add_lead_notes
Revises: add_project_extras
Create Date: 2026-10-21 00:00:00.000000

Enquiries become a small sales pipeline in the team dashboard:

- agency_leads.follow_up_on: the day to chase an enquiry next.
- lead_notes: the team's history with an enquiry, both private notes and the
  emails sent to the enquirer from the dashboard.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_lead_notes"
down_revision = "add_project_extras"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("agency_leads", sa.Column("follow_up_on", sa.Date(), nullable=True))
    op.create_table(
        "lead_notes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("lead_id", UUID, sa.ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="note"),
        sa.Column("subject", sa.String(length=200), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_lead_notes_lead_id", "lead_notes", ["lead_id"])


def downgrade() -> None:
    op.drop_index("ix_lead_notes_lead_id", table_name="lead_notes")
    op.drop_table("lead_notes")
    op.drop_column("agency_leads", "follow_up_on")
