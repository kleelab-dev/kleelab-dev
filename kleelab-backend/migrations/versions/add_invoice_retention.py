"""keep invoices after the project or account is deleted

Revision ID: add_invoice_retention
Revises: add_message_attachments
Create Date: 2026-10-21 00:00:00.000000

Invoices are tax records. Until now deleting a client's account cascaded through
their projects and took the invoices with it.

- project_invoices.project_id: nullable, and ON DELETE SET NULL instead of CASCADE.
- project_invoices.client_name / client_email / project_reference / project_title:
  copied in when the invoice is raised, so a detached invoice still says who was
  billed for what. Backfilled here for existing invoices.
"""

from alembic import op
import sqlalchemy as sa


revision = "add_invoice_retention"
down_revision = "add_message_attachments"
branch_labels = None
depends_on = None

# Postgres's default name for the unnamed constraint made in add_project_extras.
FK = "project_invoices_project_id_fkey"


def upgrade() -> None:
    op.add_column("project_invoices", sa.Column("client_name", sa.String(length=100), nullable=True))
    op.add_column("project_invoices", sa.Column("client_email", sa.String(length=255), nullable=True))
    op.add_column("project_invoices", sa.Column("project_reference", sa.String(length=20), nullable=True))
    op.add_column("project_invoices", sa.Column("project_title", sa.String(length=150), nullable=True))
    op.execute(
        """
        UPDATE project_invoices AS i
        SET client_name = u.full_name,
            client_email = u.email,
            project_reference = p.reference,
            project_title = p.title
        FROM projects AS p
        JOIN users AS u ON u.id = p.client_id
        WHERE p.id = i.project_id
        """
    )

    op.drop_constraint(FK, "project_invoices", type_="foreignkey")
    op.alter_column("project_invoices", "project_id", nullable=True)
    op.create_foreign_key(FK, "project_invoices", "projects", ["project_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    # Detached invoices have nowhere to point, and the old column cannot be null.
    op.execute("DELETE FROM project_invoices WHERE project_id IS NULL")
    op.drop_constraint(FK, "project_invoices", type_="foreignkey")
    op.alter_column("project_invoices", "project_id", nullable=False)
    op.create_foreign_key(FK, "project_invoices", "projects", ["project_id"], ["id"], ondelete="CASCADE")
    op.drop_column("project_invoices", "project_title")
    op.drop_column("project_invoices", "project_reference")
    op.drop_column("project_invoices", "client_email")
    op.drop_column("project_invoices", "client_name")
