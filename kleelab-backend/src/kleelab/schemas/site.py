"""Site request and response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SiteCreate(BaseModel):
    name: str
    subdomain: str | None = None
    template_id: UUID | None = None


class SiteUpdate(BaseModel):
    name: str | None = None
    subdomain: str | None = None
    custom_domain: str | None = None
    template_id: UUID | None = None
    # ISO-4217, upper case. Anything else would be a display bug waiting to happen.
    currency: str | None = Field(default=None, min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")


class SiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    subdomain: str | None
    custom_domain: str | None
    template_id: UUID | None
    is_published: bool
    published_at: datetime | None
    currency: str
    created_at: datetime
    updated_at: datetime