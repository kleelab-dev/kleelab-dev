"""Agency contact form and lead capture schemas."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# What the enquirer is actually after. A free-text "project type" cannot be
# routed or reported on, which is why the in-app flow asks this instead.
LeadInterest = Literal["pro", "enterprise", "migration", "general"]
LeadBudget = Literal["under_5k", "5k_15k", "15k_50k", "over_50k", "unsure"]
LeadSource = Literal["marketing", "app"]


class LeadCreate(BaseModel):
    """An enquiry from the marketing site's contact form or the in-app upgrade flow."""

    email: EmailStr
    name: str | None = Field(default=None, max_length=100)
    project_type: str | None = Field(default=None, max_length=255)
    message: str = Field(min_length=10, max_length=4000)
    # Qualification. All optional so the marketing form keeps working unchanged.
    company: str | None = Field(default=None, max_length=150)
    interest: LeadInterest | None = None
    budget: LeadBudget | None = None
    source: LeadSource = "marketing"
    # Honeypot. The form hides this field, so a human never fills it in and any
    # value at all is a reliable bot signal.
    website: str | None = Field(default=None, max_length=200)


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
