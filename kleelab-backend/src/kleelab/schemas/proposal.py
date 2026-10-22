"""Proposal schemas: the team's editor and the client's public page."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from kleelab.schemas.project import Currency

ProposalStatus = Literal["draft", "sent", "accepted", "declined", "withdrawn"]


class ProposalItem(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    amount_cents: int = Field(ge=0, le=2_000_000_000)


class ProposalStage(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)


class ProposalFields(BaseModel):
    """Everything the team can write on a proposal. All optional for a patch."""

    client_name: str | None = Field(default=None, max_length=100)
    client_email: EmailStr | None = None
    title: str | None = Field(default=None, min_length=2, max_length=150)
    summary: str | None = Field(default=None, max_length=8000)
    scope: str | None = Field(default=None, max_length=12000)
    items: list[ProposalItem] | None = Field(default=None, max_length=30)
    currency: Currency | None = None
    deposit_percent: int | None = Field(default=None, ge=0, le=100)
    duration_weeks: int | None = Field(default=None, ge=1, le=104)
    stages: list[ProposalStage] | None = Field(default=None, max_length=12)
    terms: str | None = Field(default=None, max_length=8000)
    valid_until: date | None = None

    @field_validator("client_name", "summary", "scope", "terms")
    @classmethod
    def blank_is_none(cls, value: str | None) -> str | None:
        return (value or "").strip() or None


class ProposalCreate(ProposalFields):
    lead_id: UUID


class ProposalPatch(ProposalFields):
    pass


class ProposalSummary(BaseModel):
    """One row in a list of proposals."""

    id: UUID
    reference: str
    title: str
    # draft | sent | accepted | declined | withdrawn | expired
    status: str
    currency: str
    total_cents: int
    sent_at: datetime | None
    viewed_at: datetime | None
    accepted_at: datetime | None
    declined_at: datetime | None
    valid_until: date | None
    created_at: datetime
    updated_at: datetime
    lead_id: UUID
    project_id: UUID | None


class ProposalDetail(ProposalSummary):
    """The whole proposal, as the team edits it."""

    revision: int
    client_name: str | None
    client_email: str
    summary: str | None
    scope: str | None
    items: list[ProposalItem]
    deposit_percent: int
    deposit_cents: int
    duration_weeks: int | None
    stages: list[ProposalStage]
    terms: str | None
    accepted_name: str | None
    decline_reason: str | None
    author_name: str | None
    # The client's link. Only set once it is sent: a draft has no public page.
    public_url: str | None


class PublicProposal(BaseModel):
    """What the client sees. No ids, no team notes, no addresses but their own."""

    reference: str
    revision: int
    status: str
    client_name: str | None
    title: str
    summary: str | None
    scope: str | None
    items: list[ProposalItem]
    currency: str
    total_cents: int
    deposit_percent: int
    deposit_cents: int
    duration_weeks: int | None
    stages: list[ProposalStage]
    terms: str | None
    valid_until: date | None
    sent_at: datetime | None
    accepted_at: datetime | None
    accepted_name: str | None
    declined_at: datetime | None
    prepared_by: str | None


class ProposalAccept(BaseModel):
    # Typed in full, as a signature.
    name: str = Field(min_length=2, max_length=100)
    agree: Literal[True]
    revision: int


class ProposalDecline(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)
    revision: int


class ProposalAccepted(BaseModel):
    proposal: PublicProposal
    # True when the client had no account: we emailed a link to choose a password.
    invited: bool
    # False when that email could not be delivered: the page points them to "forgot password" instead.
    invite_sent: bool = False
    email: str
