"""Agency contact form and lead capture schemas."""

import re
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from kleelab.schemas.call import TeamCallOut
from kleelab.schemas.proposal import ProposalSummary

# What the enquirer is actually after. A free-text "project type" cannot be
# routed or reported on, which is why the in-app flow asks this instead.
LeadInterest = Literal["pro", "enterprise", "migration", "general"]
# Budget bands in naira, from 2026 Nigerian price guides: a business site is
# usually under N500k, a shop N500k-N1.5m, a web app N1.5m-N5m and up.
BUDGET_BANDS = {"under_500k", "500k_1_5m", "1_5m_5m", "over_5m", "unsure"}
# Or the enquirer types their own figure, stored as "ngn_<whole naira>".
CUSTOM_BUDGET = re.compile(r"^ngn_[1-9]\d{0,12}$")
LeadSource = Literal["marketing", "app", "chat"]


class LeadCreate(BaseModel):
    """An enquiry from the marketing site's contact form or the in-app upgrade flow."""

    email: EmailStr
    name: str | None = Field(default=None, max_length=100)
    project_type: str | None = Field(default=None, max_length=255)
    message: str = Field(min_length=10, max_length=4000)
    # Qualification. All optional so the marketing form keeps working unchanged.
    company: str | None = Field(default=None, max_length=150)
    interest: LeadInterest | None = None
    budget: str | None = Field(default=None, max_length=20)
    source: LeadSource = "marketing"
    # Sent from a portfolio item's page: which one they asked about.
    portfolio_slug: str | None = Field(default=None, max_length=80)
    # Honeypot. The form hides this field, so a human never fills it in and any
    # value at all is a reliable bot signal.
    website: str | None = Field(default=None, max_length=200)

    @field_validator("budget")
    @classmethod
    def known_budget(cls, value: str | None) -> str | None:
        if value is None or value in BUDGET_BANDS or CUSTOM_BUDGET.match(value):
            return value
        raise ValueError("Pick a budget range or type an amount in naira")


class LeadReceived(BaseModel):
    """Deliberately terse: a public endpoint should not echo the submission back."""

    status: str


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: str | None
    company: str | None
    interest: str | None
    budget: str | None
    source: str
    feature_requested: str | None
    message: str | None
    status: str
    created_at: datetime
    follow_up_on: date | None = None
    # Set when a project was started from this enquiry.
    project_id: UUID | None = None
    # The portfolio item they asked about, from its page.
    portfolio_item_id: UUID | None = None


class LeadNoteOut(BaseModel):
    id: UUID
    # note | email
    kind: str
    subject: str | None
    body: str
    author_name: str | None
    created_at: datetime


class LeadDetail(LeadOut):
    """One enquiry with the team's notes and the emails sent about it, oldest first."""

    notes: list[LeadNoteOut] = []
    # Newest first.
    proposals: list[ProposalSummary] = []
    # Calls booked, newest first.
    calls: list[TeamCallOut] = []


class LeadNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class LeadReplyCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=10000)
