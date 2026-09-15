"""add lead qualification fields

Revision ID: add_lead_qualification
Revises: add_ai_generations
Create Date: 2026-09-15 00:00:00.000000

Enterprise work is delivered by people, not by the product, so the in-app
"talk to us" path has to arrive with enough context to be routed. The marketing
contact form only ever collected a free-text message, which is unqualifiable.

`source` distinguishes an in-app upgrade enquiry from a marketing-site contact
form submission. Both land in the same table because both are the same thing to
whoever picks them up.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_lead_qualification"
down_revision = "add_ai_generations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agency_leads", sa.Column("company", sa.String(length=150), nullable=True))
    op.add_column("agency_leads", sa.Column("interest", sa.String(length=50), nullable=True))
    op.add_column("agency_leads", sa.Column("budget", sa.String(length=50), nullable=True))
    op.add_column(
        "agency_leads",
        sa.Column("source", sa.String(length=20), nullable=False, server_default="marketing"),
    )


def downgrade() -> None:
    op.drop_column("agency_leads", "source")
    op.drop_column("agency_leads", "budget")
    op.drop_column("agency_leads", "interest")
    op.drop_column("agency_leads", "company")
