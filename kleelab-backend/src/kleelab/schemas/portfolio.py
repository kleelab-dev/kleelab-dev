"""The portfolio: what the team edits, and what visitors see."""

import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from kleelab.schemas.project import Currency

PortfolioKind = Literal["work", "for_sale"]
PortfolioStatus = Literal["draft", "published", "sold", "archived"]

SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MAX_IMAGES = 12
MAX_TAGS = 8


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


class PortfolioImage(BaseModel):
    url: str
    alt: str = Field(default="", max_length=200)
    width: int | None = None
    height: int | None = None


class PortfolioImageUpload(BaseModel):
    # A base64 data URL, as the asset uploads take.
    data: str
    filename: str = Field(default="image", max_length=255)
    alt: str = Field(default="", max_length=200)


class PortfolioItemIn(BaseModel):
    """Everything the editor saves. Images are only reordered, relabelled or removed
    here; new ones arrive through the upload endpoint."""

    kind: PortfolioKind
    title: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, max_length=80)
    summary: str = Field(default="", max_length=300)
    body: str | None = Field(default=None, max_length=20000)
    sector: str | None = Field(default=None, max_length=60)
    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)
    demo_url: str | None = Field(default=None, max_length=500)
    images: list[PortfolioImage] = Field(default_factory=list, max_length=MAX_IMAGES)
    client_name: str | None = Field(default=None, max_length=150)
    client_permission: bool = False
    price_cents: int | None = Field(default=None, gt=0, le=2_000_000_000)
    currency: Currency = "NGN"
    includes: str | None = Field(default=None, max_length=3000)
    customisable: str | None = Field(default=None, max_length=3000)
    delivery_days: int | None = Field(default=None, ge=1, le=365)
    exclusive: bool = False
    template_id: UUID | None = None
    status: PortfolioStatus = "draft"
    featured: bool = False

    _strip = field_validator("body", "sector", "client_name", "includes", "customisable")(_clean)

    @field_validator("title", "summary")
    @classmethod
    def trimmed(cls, value: str) -> str:
        return value.strip()

    @field_validator("slug")
    @classmethod
    def slug_shape(cls, value: str | None) -> str | None:
        value = (value or "").strip().lower()
        if not value:
            return None
        if not SLUG.match(value):
            raise ValueError("Use lower-case letters, numbers and dashes, like amaka-bakes")
        return value

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, value: list[str]) -> list[str]:
        seen: list[str] = []
        for tag in value:
            tag = tag.strip()[:40]
            if tag and tag.lower() not in {t.lower() for t in seen}:
                seen.append(tag)
        return seen

    @field_validator("demo_url")
    @classmethod
    def demo_shape(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        if not value:
            return None
        if not value.startswith(("https://", "http://")):
            value = f"https://{value}"
        if not re.match(r"^https?://[^\s/$.?#][^\s]*\.[^\s]+$", value):
            raise ValueError("That does not look like a web address")
        return value


class PortfolioOrder(BaseModel):
    ids: list[UUID] = Field(max_length=500)


class PortfolioItemOut(BaseModel):
    """The team's view: everything, with how it is doing."""

    id: UUID
    kind: PortfolioKind
    slug: str
    title: str
    summary: str
    body: str | None
    sector: str | None
    tags: list[str]
    demo_url: str | None
    images: list[PortfolioImage]
    client_name: str | None
    client_permission: bool
    project_id: UUID | None
    project_reference: str | None
    price_cents: int | None
    currency: str
    includes: str | None
    customisable: str | None
    delivery_days: int | None
    exclusive: bool
    template_id: UUID | None
    template_name: str | None
    status: PortfolioStatus
    featured: bool
    position: int
    preview_token: str
    # Where visitors see it, and the link that shows a draft before it is published.
    public_url: str
    preview_url: str
    view_count: int
    demo_clicks: int
    enquiries: int
    demo_status: str | None
    demo_error: str | None
    demo_checked_at: datetime | None
    published_at: datetime | None
    updated_at: datetime
    # What still stops it being published, in words. Empty when it can go live.
    missing: list[str]


class PublicPortfolioItem(BaseModel):
    """What visitors see. Nothing about enquiries, the client's permission or the team."""

    kind: PortfolioKind
    slug: str
    title: str
    summary: str
    body: str | None
    sector: str | None
    tags: list[str]
    demo_url: str | None
    images: list[PortfolioImage]
    client_name: str | None
    price_cents: int | None
    currency: str
    includes: list[str]
    customisable: list[str]
    delivery_days: int | None
    exclusive: bool
    sold: bool
    featured: bool
    published_at: datetime | None
    updated_at: datetime
    # Only on a draft opened with its preview link.
    preview: bool = False


class PortfolioEvent(BaseModel):
    kind: Literal["view", "demo"]
