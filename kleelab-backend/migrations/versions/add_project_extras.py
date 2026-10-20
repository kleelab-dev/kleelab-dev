"""project owners, files, invoices and lead links

Revision ID: add_project_extras
Revises: add_projects
Create Date: 2026-10-20 12:00:00.000000

What running projects day to day turned out to need:

- projects.owner_id: which team member looks after a project.
- projects.lead_id: the enquiry a project came from, so it is not typed twice.
- project_files: files either side uploads. Stored in Postgres rather than on
  disk, because the API host's disk does not survive a redeploy; the size cap
  keeps that sensible.
- project_invoices: what the client owes and whether it is paid. Payment itself
  happens through a pay link (Stripe, Paystack...), so no card data comes here.

Team notes need no column: they are project_updates with kind 'note', which the
client's view leaves out.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_project_extras"
down_revision = "add_projects"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("owner_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("lead_id", UUID, sa.ForeignKey("agency_leads.id", ondelete="SET NULL"), nullable=True),
    )

    op.create_table(
        "project_files",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploaded_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_project_files_project_id", "project_files", ["project_id"])

    op.create_table(
        "project_invoices",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.String(length=20), nullable=False, unique=True),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="unpaid"),
        sa.Column("pay_url", sa.String(length=500), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_project_invoices_project_id", "project_invoices", ["project_id"])


def downgrade() -> None:
    op.drop_table("project_invoices")
    op.drop_table("project_files")
    op.drop_column("projects", "lead_id")
    op.drop_column("projects", "owner_id")
