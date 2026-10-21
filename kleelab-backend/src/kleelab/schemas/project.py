"""Client project schemas, shared by the client dashboard and the staff admin."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl

ProjectStatus = Literal["active", "on_hold", "completed", "cancelled"]
StageStatus = Literal["upcoming", "in_progress", "waiting_on_client", "done"]
UpdateKind = Literal["progress", "message", "approval", "note"]
RequestKind = Literal["deployment", "hosting", "maintenance", "change"]
RequestStatus = Literal["open", "accepted", "declined", "done"]
InvoiceStatus = Literal["unpaid", "paid", "cancelled"]
Currency = Literal["USD", "GBP", "EUR", "NGN", "CAD", "AUD"]


class StageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    position: int
    name: str
    description: str | None
    status: str
    due_date: date | None
    completed_at: datetime | None


class UpdateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    stage_id: UUID | None
    kind: str
    title: str | None
    body: str
    link_url: str | None
    link_label: str | None
    approval_status: str | None
    approval_note: str | None
    resolved_at: datetime | None
    created_at: datetime
    # Filled in by the service: who wrote it, and whether that was the KleeLab team.
    author_name: str | None = None
    from_team: bool = False


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: str
    message: str | None
    status: str
    created_at: datetime


class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    content_type: str
    size: int
    created_at: datetime
    uploaded_by_name: str | None = None
    from_team: bool = False


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    number: str
    title: str
    amount_cents: int
    currency: str
    due_date: date | None
    status: str
    pay_url: str | None
    paid_at: datetime | None
    created_at: datetime


class ProjectSummary(BaseModel):
    """One row in a project list."""

    id: UUID
    reference: str
    title: str
    status: str
    target_date: date | None
    current_stage: str | None
    stages_done: int
    stages_total: int
    # Approvals still waiting on the client. The one number a client must act on.
    pending_approvals: int
    open_requests: int
    unpaid_invoices: int = 0
    updated_at: datetime
    client_email: str | None = None
    client_name: str | None = None
    # Team view only.
    owner_id: UUID | None = None
    owner_name: str | None = None
    # The newest message is from the client, so someone should reply.
    awaiting_reply: bool = False


class ProjectDetail(BaseModel):
    id: UUID
    reference: str
    title: str
    summary: str | None
    status: str
    start_date: date | None
    target_date: date | None
    live_url: str | None
    created_at: datetime
    updated_at: datetime
    stages: list[StageOut]
    updates: list[UpdateOut]
    requests: list[RequestOut]
    files: list[FileOut] = []
    invoices: list[InvoiceOut] = []
    client_email: str | None = None
    client_name: str | None = None
    # Team view only.
    owner_id: UUID | None = None
    owner_name: str | None = None
    lead_id: UUID | None = None


# --- Client actions -------------------------------------------------------


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ApprovalDecision(BaseModel):
    decision: Literal["approved", "changes_requested"]
    note: str | None = Field(default=None, max_length=2000)


class RequestCreate(BaseModel):
    kind: RequestKind
    message: str | None = Field(default=None, max_length=2000)


# --- Staff actions --------------------------------------------------------


class ProjectCreate(BaseModel):
    client_email: EmailStr
    client_name: str | None = Field(default=None, max_length=100)
    title: str = Field(min_length=2, max_length=150)
    summary: str | None = Field(default=None, max_length=4000)
    start_date: date | None = None
    target_date: date | None = None
    # Omit to use the standard six stages.
    stages: list[str] | None = Field(default=None, max_length=12)
    owner_id: UUID | None = None
    # The enquiry this project grew from. It is marked as won.
    lead_id: UUID | None = None


class ProjectPatch(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=150)
    summary: str | None = Field(default=None, max_length=4000)
    status: ProjectStatus | None = None
    start_date: date | None = None
    target_date: date | None = None
    live_url: HttpUrl | None = None
    owner_id: UUID | None = None


class StagePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    status: StageStatus | None = None
    due_date: date | None = None
    description: str | None = Field(default=None, max_length=2000)


class StageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)


class StageMove(BaseModel):
    direction: Literal["up", "down"]


class StaffUpdateCreate(BaseModel):
    kind: UpdateKind
    title: str | None = Field(default=None, max_length=150)
    body: str = Field(min_length=1, max_length=8000)
    stage_id: UUID | None = None
    link_url: HttpUrl | None = None
    link_label: str | None = Field(default=None, max_length=100)


class RequestPatch(BaseModel):
    status: RequestStatus


class ProjectCreated(BaseModel):
    project: ProjectDetail
    # True when the client had no account, so one was created and an invite sent.
    invited: bool


class InvoiceCreate(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    amount_cents: int = Field(gt=0, le=2_000_000_000)
    currency: Currency
    due_date: date | None = None
    pay_url: HttpUrl | None = None


class InvoicePatch(BaseModel):
    status: InvoiceStatus | None = None
    due_date: date | None = None
    pay_url: HttpUrl | None = None


class StaffMember(BaseModel):
    id: UUID
    name: str
    email: str


class AttentionItem(BaseModel):
    """One thing across all projects that a person should look at."""

    # new_enquiry | follow_up | client_message | open_request | waiting_approval | overdue_step | unpaid_invoice
    kind: str
    project_id: UUID | None
    reference: str | None
    project_title: str | None
    text: str
    since: datetime | date | None
    owner_name: str | None = None
    lead_id: UUID | None = None
