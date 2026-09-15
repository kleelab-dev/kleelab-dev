"""AI builder request and response contracts.

The section list travels *from* the client on every call. That is the important
decision in this file: the Section Kit lives once, in the frontend, and the server
never keeps its own copy of what a section contains. A second copy is a second
thing to keep in step, and this codebase has already paid twice for exactly that
mistake (the frontend zod schema and the backend Pydantic model drifting apart).
The server's job is to talk to the model and hand back data; naming sections and
deciding what a valid section looks like stays with the kit.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# The whole-theme presets the frontend offers. A palette name is safer than a
# colour list: it cannot produce an unreadable combination, and the customer can
# still override any individual colour afterwards in the theme panel.
PaletteName = Literal["neutral", "warm", "ocean", "forest", "plum", "dark"]


class BriefRequest(BaseModel):
    """What the customer typed, plus the sections the kit can build."""

    prompt: str = Field(min_length=10, max_length=2000)
    site_name: str | None = Field(default=None, max_length=100)
    # Ids only. Naming the available sections is how the model is stopped from
    # inventing one that does not exist.
    section_ids: list[str] = Field(min_length=1, max_length=40)


class BriefPage(BaseModel):
    """One page the model decided the site needs."""

    title: str = Field(min_length=1, max_length=80)
    slug: str = Field(min_length=1, max_length=80)
    purpose: str = Field(default="", max_length=300)
    sections: list[str] = Field(min_length=1, max_length=12)

    @field_validator("slug")
    @classmethod
    def _url_safe(cls, value: str) -> str:
        """Slugs become URLs, so they must not be able to become anything else."""

        cleaned = value.strip()
        if not cleaned.startswith("/"):
            cleaned = f"/{cleaned}"
        allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-/")
        if any(character not in allowed for character in cleaned):
            raise ValueError("slug must be lowercase letters, numbers, hyphens and slashes")
        return cleaned


class Brief(BaseModel):
    """The model's understanding of the business, before any copy is written."""

    model_config = ConfigDict(extra="ignore")

    business_name: str = Field(min_length=1, max_length=80)
    tagline: str = Field(default="", max_length=160)
    summary: str = Field(default="", max_length=400)
    audience: str = Field(default="", max_length=200)
    tone: str = Field(default="", max_length=80)
    palette: PaletteName = "neutral"
    pages: list[BriefPage] = Field(min_length=1, max_length=3)


class BriefResponse(BaseModel):
    brief: Brief
    model: str
    tokens_in: int
    tokens_out: int


class SectionSpec(BaseModel):
    """One section to write copy for, described by the kit itself."""

    id: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=400)
    # The recipe's own filled-in defaults, straight from `describeRecipe`. It
    # doubles as the schema the model is asked to match and as the fallback the
    # frontend uses when a field comes back wrong.
    example: dict[str, Any] = Field(default_factory=dict)


class ContentRequest(BaseModel):
    brief: Brief
    page_title: str = Field(default="Home", max_length=80)
    sections: list[SectionSpec] = Field(min_length=1, max_length=12)


class SectionContent(BaseModel):
    id: str
    content: dict[str, Any]


class ContentResponse(BaseModel):
    sections: list[SectionContent]
    model: str
    tokens_in: int
    tokens_out: int


class AIStatus(BaseModel):
    """Whether the builder can run, and how much allowance is left.

    Exists so the interface can decide *before* someone types a paragraph whether
    the feature is available, instead of offering a button that fails.
    """

    available: bool
    reason: str | None = None
    builds_remaining: int
    builds_per_month: int
