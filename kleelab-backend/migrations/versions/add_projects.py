"""add client projects and staff role

Revision ID: add_projects
Revises: add_lead_qualification
Create Date: 2026-10-20 00:00:00.000000

KleeLab now builds for clients instead of offering a self-serve builder. A client
follows their project through its stages on a dashboard, so this adds projects,
their stages, the timeline of updates, and add-on requests. users.role marks the
KleeLab team, who run projects from the admin view.

The builder's tables (sites, pages, products, orders...) are left in place. The
builder is retired for now, and dropping a customer's data is not reversible.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_projects"
down_revision = "add_lead_qualification"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("role", sa.String(length=20), nullable=False, server_default="client")
    )

    op.create_table(
        "projects",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("client_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reference", sa.String(length=20), nullable=False, unique=True),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("live_url", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_projects_client_id", "projects", ["client_id"])

    op.create_table(
        "project_stages",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="upcoming"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_project_stages_project_id", "project_stages", ["project_id"])

    op.create_table(
        "project_updates",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage_id", UUID, sa.ForeignKey("project_stages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("author_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link_url", sa.String(length=500), nullable=True),
        sa.Column("link_label", sa.String(length=100), nullable=True),
        sa.Column("approval_status", sa.String(length=20), nullable=True),
        sa.Column("approval_note", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_project_updates_project_id", "project_updates", ["project_id"])

    op.create_table(
        "project_requests",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_project_requests_project_id", "project_requests", ["project_id"])


def downgrade() -> None:
    op.drop_table("project_requests")
    op.drop_table("project_updates")
    op.drop_table("project_stages")
    op.drop_table("projects")
    op.drop_column("users", "role")
