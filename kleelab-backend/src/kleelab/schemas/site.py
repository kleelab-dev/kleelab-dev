"""Site request and response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SiteCreate(BaseModel):
    name: str
    subdomain: str | None = None
    template_id: UUID | None = None


class SiteUpdate(BaseModel):
    name: str | None = None
    subdomain: str | None = None
    custom_domain: str | None = None
    template_id: UUID | None = None


class SiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    subdomain: str | None
    custom_domain: str | None
    template_id: UUID | None
    is_published: bool
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime