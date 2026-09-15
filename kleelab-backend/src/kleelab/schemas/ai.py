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


class SectionSpec(BaseModel):
    """One section the kit can build, described by the kit itself.

    Sent on both calls. The brief call uses the name and description so the model
    can choose intelligently — a bare id like `features.alternating` tells it
    nothing, and a model choosing blind picks the same three safe sections every
    time. The content call uses `example`, which doubles as the schema its answer
    must match and as the fallback the frontend uses when a field comes back
    wrong.
    """

    id: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=400)
    example: dict[str, Any] = Field(default_factory=dict)


class BriefRequest(BaseModel):
    """What the customer typed, plus the sections the kit can build."""

    prompt: str = Field(min_length=10, max_length=2000)
    site_name: str | None = Field(default=None, max_length=100)
    # The catalogue, so the model can choose with its eyes open. Ids only would
    # be a guessing game, and this is the decision that most affects whether the
    # resulting page looks designed.
    sections: list[SectionSpec] = Field(min_length=1, max_length=40)


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


class ContentRequest(BaseModel):
    """The page to write, with each section described by the kit."""

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


# ---------------------------------------------------------------------------
# Editing an existing site by conversation
# ---------------------------------------------------------------------------

class OutlineNode(BaseModel):
    """One node of the current page, as the model is allowed to see it.

    A compact outline rather than the document itself, for the same reason the
    section kit is never mirrored on the server: the shape of a document lives in
    the frontend, and sending the whole tree back and forth would cost a page of
    tokens per turn just to ask for a colour change.
    """

    id: str = Field(min_length=1, max_length=80)
    type: str = Field(max_length=40)
    #: The visible text, so the model can find "the heading that says About us".
    text: str = Field(default="", max_length=200)
    #: A human label, e.g. "Header — text and image".
    label: str = Field(default="", max_length=80)


EditOp = Literal[
    "set_theme",
    "set_text",
    "set_style",
    "set_image",
    "replace_section",
    "add_section",
    "remove_section",
    "move_section",
]


class EditOperation(BaseModel):
    """One change, targeted at one node.

    Deliberately a single flat shape with optional fields rather than eight
    models: the model is filling in a form it can see the whole of, and a
    discriminated union would make its answers harder to get right for no gain in
    safety, since `clean_operations` checks the required fields per operation
    anyway.

    `extra="forbid"` stays on — it is what surfaces a model inventing a field
    instead of quietly ignoring it.
    """

    model_config = ConfigDict(extra="forbid")

    op: EditOp
    #: The node being changed.
    node_id: str | None = Field(default=None, max_length=80)
    #: Where a new section goes, or what a moved one goes after.
    after_node_id: str | None = Field(default=None, max_length=80)
    #: New visible text, for `set_text`.
    text: str | None = Field(default=None, max_length=4000)
    #: A theme slot name and the colour to put in it, for `set_theme`.
    slot: str | None = Field(default=None, max_length=40)
    colour: str | None = Field(default=None, max_length=64)
    #: A style patch, for `set_style`. Validated against the document schema by
    #: the client, which is the only side that knows the style tokens.
    style: dict[str, Any] | None = None
    #: Which recipe to build, for `replace_section` and `add_section`.
    section_id: str | None = Field(default=None, max_length=40)
    content: dict[str, Any] | None = None
    #: A photograph, for `set_image`.
    src: str | None = Field(default=None, max_length=2000)
    alt: str | None = Field(default=None, max_length=400)


class EditRequest(BaseModel):
    """One turn of the conversation."""

    instruction: str = Field(min_length=2, max_length=1000)
    page_title: str = Field(default="Home", max_length=80)
    outline: list[OutlineNode] = Field(min_length=1, max_length=400)
    #: The site's current theme, so "make it warmer" has something to act on.
    theme: dict[str, str] = Field(default_factory=dict)
    #: The palette names the theme may be set to.
    palettes: list[str] = Field(default_factory=list, max_length=20)
    #: The catalogue, so `replace_section` and `add_section` can only name
    #: sections that exist.
    sections: list[SectionSpec] = Field(default_factory=list, max_length=40)
    #: The style keys and the values each accepts, sent by the client for the same
    #: reason the catalogue is: the definition lives in the frontend, and a copy
    #: here would be a second thing to keep in step. Rendered into the prompt so
    #: the model cannot invent `size: "huge"`.
    style_tokens: dict[str, list[str]] = Field(default_factory=dict)
    #: Recent turns, oldest first, so "do that again but bigger" has a referent.
    history: list[str] = Field(default_factory=list, max_length=12)


class EditResponse(BaseModel):
    """What to do, and what to tell the user about it."""

    operations: list[EditOperation] = Field(default_factory=list)
    #: One sentence describing what changed, shown in the conversation. Empty
    #: operations with a summary is the answer to a question, which is a normal
    #: turn rather than a failure.
    summary: str = Field(default="", max_length=600)
    model: str
    tokens_in: int
    tokens_out: int
