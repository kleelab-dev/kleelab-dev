"""Agency contact form and lead capture schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LeadCreate(BaseModel):
    """An enquiry from the marketing site's contact form."""

    email: EmailStr
    name: str | None = Field(default=None, max_length=100)
    project_type: str | None = Field(default=None, max_length=255)
    message: str = Field(min_length=10, max_length=4000)
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
    feature_requested: str | None
    message: str | None
    status: str
    created_at: datetime
