"""Page request and response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PageCreate(BaseModel):
    title: str
    slug: str
    content: dict | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    meta_keywords: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_image: str | None = None


class PageUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    content: dict | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    meta_keywords: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_image: str | None = None


class PageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    site_id: UUID
    title: str
    slug: str
    content: dict | None
    meta_title: str | None
    meta_description: str | None
    meta_keywords: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_image: str | None = None
    created_at: datetime
    updated_at: datetime