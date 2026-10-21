"""The team page, the activity log and search in the team dashboard."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class TeamMember(BaseModel):
    id: UUID
    name: str | None
    email: str
    is_active: bool
    two_step_enabled: bool
    created_at: datetime
    # None until they first sign in, so an unanswered invite shows.
    last_sign_in: datetime | None
    projects_in_charge: int
    is_you: bool


class TeamCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=100)


class TeamPatch(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None


class TeamInviteResult(BaseModel):
    member: TeamMember
    invite_sent: bool


class ActivityOut(BaseModel):
    id: UUID
    action: str
    summary: str
    actor_id: UUID | None
    actor_name: str | None
    # True when the actor is a client rather than the team.
    by_client: bool
    project_id: UUID | None
    project_reference: str | None
    project_title: str | None
    subject_type: str | None
    subject_id: UUID | None
    created_at: datetime


class ActivityPage(BaseModel):
    events: list[ActivityOut]
    # Pass as `before` for the next, older page. None when there is no more.
    next_before: str | None


class SearchProject(BaseModel):
    id: UUID
    reference: str
    title: str
    status: str
    client_name: str | None


class SearchClient(BaseModel):
    id: UUID
    name: str | None
    email: str
    is_active: bool


class SearchLead(BaseModel):
    id: UUID
    name: str | None
    email: str
    company: str | None
    status: str
    created_at: datetime


class SearchInvoice(BaseModel):
    id: UUID
    number: str
    title: str
    status: str
    amount_cents: int
    currency: str
    due_date: date | None
    project_id: UUID
    project_reference: str


class SearchTeammate(BaseModel):
    id: UUID
    name: str | None
    email: str
    is_active: bool


class SearchMessage(BaseModel):
    """A post on a project whose words match, with a few words either side."""

    id: UUID
    kind: str
    snippet: str
    project_id: UUID
    project_reference: str
    project_title: str
    author_name: str | None
    created_at: datetime


class SearchResults(BaseModel):
    projects: list[SearchProject]
    clients: list[SearchClient]
    leads: list[SearchLead]
    invoices: list[SearchInvoice]
    team: list[SearchTeammate]
    messages: list[SearchMessage]


class AlertOut(BaseModel):
    """Something a client (or a new enquirer) did that the team should see."""

    id: UUID
    action: str
    summary: str
    actor_name: str | None
    project_id: UUID | None
    project_reference: str | None
    project_title: str | None
    subject_type: str | None
    subject_id: UUID | None
    created_at: datetime
    # Newer than when this teammate last looked.
    unread: bool


class AlertList(BaseModel):
    items: list[AlertOut]
    unread: int
    seen_at: datetime | None
