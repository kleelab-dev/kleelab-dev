"""Canonical document contract.

Mirrors the TypeScript schema in the frontend (`src/lib/document.ts`). The
document model is the single source of truth for page content, shared by the
editor and the published site renderer.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

DOCUMENT_SCHEMA_VERSION = 1

NodeType = Literal[
    "page",
    "section",
    "container",
    "grid",
    "heading",
    "text",
    "image",
    "button",
    "link",
    "divider",
    "spacer",
    "list",
    "form",
    "input",
    "nav",
    "footer",
    "html",
    # Storefront blocks (R6).
    "product_grid",
    "cart_button",
]

SpaceToken = Literal["none", "xs", "sm", "md", "lg", "xl"]
Alignment = Literal["left", "center", "right"]
TextSize = Literal["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]
Radius = Literal["none", "sm", "md", "lg", "full"]
Shadow = Literal["none", "sm", "md", "lg"]
MaxWidth = Literal["sm", "md", "lg", "xl", "full"]
BorderWidth = Literal["none", "thin", "medium", "thick"]

# Bounds a colour value without constraining it to a list. Long enough for any
# CSS colour function, short enough that a payload cannot smuggle in a novel.
COLOUR_MAX_LENGTH = 64


class NodeStyle(BaseModel):
    """Styling for one node.

    Colours are free strings on purpose: a value is either a theme slot name
    (`ink`, `accent`) or any CSS colour. Constraining them to an enum is exactly
    what previously stopped a customer site from having its own palette, and it
    rejected every colour the editor offered.
    """

    model_config = ConfigDict(extra="forbid")

    background: str | None = Field(default=None, max_length=COLOUR_MAX_LENGTH)
    color: str | None = Field(default=None, max_length=COLOUR_MAX_LENGTH)
    borderColor: str | None = Field(default=None, max_length=COLOUR_MAX_LENGTH)
    borderWidth: BorderWidth | None = None
    align: Alignment | None = None
    size: TextSize | None = None
    padding: SpaceToken | None = None
    paddingX: SpaceToken | None = None
    paddingY: SpaceToken | None = None
    gap: SpaceToken | None = None
    radius: Radius | None = None
    shadow: Shadow | None = None
    maxWidth: MaxWidth | None = None


class Node(BaseModel):
    """One element in the document tree."""

    id: str = Field(min_length=1)
    type: NodeType
    props: dict[str, Any] = Field(default_factory=dict)
    style: NodeStyle | None = None
    responsive: dict[str, NodeStyle] | None = None
    children: list["Node"] = Field(default_factory=list)


class Document(BaseModel):
    """A complete page document."""

    model_config = ConfigDict(extra="forbid")

    schemaVersion: int = Field(ge=1)
    root: Node
    tokens: dict[str, str] | None = None


Document.model_rebuild()
Node.model_rebuild()


def validate_document_payload(content: dict[str, Any] | None) -> None:
    """Validate `content["document"]` when present.

    Legacy content (the old `blocks` / `sections` shapes) carries no `document`
    key and is intentionally left untouched until the editor migrates to the
    document model.

    Raises:
        ValueError: when a document is present but does not match the contract.
    """

    if not isinstance(content, dict):
        return

    candidate = content.get("document")
    if candidate is None:
        return

    try:
        Document.model_validate(candidate)
    except ValidationError as error:
        raise ValueError(f"Invalid document: {error.errors()[:3]}") from error
