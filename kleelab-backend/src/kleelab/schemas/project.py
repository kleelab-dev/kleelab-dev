"""Client project schemas, shared by the client dashboard and the staff admin."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, model_validator

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
    attachments: list["FileOut"] = []


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
    # The message this file was sent with, if any.
    update_id: UUID | None = None
    uploaded_by_name: str | None = None
    from_team: bool = False


UpdateOut.model_rebuild()


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
    # "paystack" when it was paid online by card; null when marked paid by hand.
    paid_via: str | None = None
    payment_reference: str | None = None
    # deposit | balance | full when raised from an accepted proposal; null otherwise.
    kind: str | None = None
    reminders_sent: int = 0
    last_reminded_at: datetime | None = None
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
    client_id: UUID | None = None
    owner_id: UUID | None = None
    owner_name: str | None = None
    # The newest message is from the client, so someone should reply.
    awaiting_reply: bool = False


class ChecklistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    position: int
    title: str
    description: str | None
    done_at: datetime | None
    note: str | None
    done_by_name: str | None = None


class HandoverItem(BaseModel):
    """One line of the hand-over pack: a fact, a link, or both."""

    label: str = Field(min_length=1, max_length=100)
    value: str | None = Field(default=None, max_length=500)
    url: HttpUrl | None = None


class HandoverOut(BaseModel):
    notes: str | None
    items: list[HandoverItem]
    # Null while the team is still writing it. Clients only see it once set.
    published_at: datetime | None
    updated_at: datetime


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
    # Still to be billed at hand-over: the rest of the accepted proposal's price.
    balance_due_cents: int | None = None
    balance_currency: str | None = None
    # What we need from the client to get started, in order.
    checklist: list[ChecklistItemOut] = []
    # The hand-over pack: always for the team, for the client once published.
    handover: HandoverOut | None = None
    client_email: str | None = None
    client_name: str | None = None
    # Team view only.
    client_id: UUID | None = None
    owner_id: UUID | None = None
    owner_name: str | None = None
    lead_id: UUID | None = None


# --- Client actions -------------------------------------------------------


MAX_ATTACHMENTS = 6


class MessageCreate(BaseModel):
    """Words, files sent ahead to /attachments, or both."""

    body: str = Field(default="", max_length=4000)
    attachment_ids: list[UUID] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)

    @model_validator(mode="after")
    def _not_empty(self) -> "MessageCreate":
        if not self.body.strip() and not self.attachment_ids:
            raise ValueError("Write a message or attach a file")
        if len(set(self.attachment_ids)) != len(self.attachment_ids):
            raise ValueError("The same file is attached twice")
        return self


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


class ChecklistTick(BaseModel):
    done: bool
    note: str | None = Field(default=None, max_length=1000)


class ChecklistItemCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=1000)


class ChecklistItemPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=1000)


class HandoverSave(BaseModel):
    notes: str | None = Field(default=None, max_length=10000)
    items: list[HandoverItem] = Field(default_factory=list, max_length=40)


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
    # Files sent ahead to /api/projects/{id}/attachments. Not on team notes: a
    # file always ends up in the client's file list.
    attachment_ids: list[UUID] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)


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

    # new_enquiry | follow_up | upcoming_call | client_message | open_request | waiting_approval
    # | overdue_step | unpaid_invoice | checklist_waiting | handover_missing
    kind: str
    project_id: UUID | None
    reference: str | None
    project_title: str | None
    text: str
    since: datetime | date | None
    owner_name: str | None = None
    lead_id: UUID | None = None


# --- Money and clients (team view) ------------------------------------------------


class MoneyTotal(BaseModel):
    currency: str
    cents: int
    count: int


class AdminInvoiceOut(InvoiceOut):
    """An invoice with the project and client it belongs to, for the money page."""

    project_id: UUID
    project_title: str
    project_reference: str
    client_id: UUID | None = None
    client_name: str | None = None
    client_email: str | None = None


class ClientSummary(BaseModel):
    id: UUID
    name: str | None
    email: str
    is_active: bool
    created_at: datetime
    # Null until they first sign in, which means the invite was never used.
    last_sign_in: datetime | None
    # The most recent change on any of their projects.
    last_activity: datetime | None
    project_count: int
    active_projects: int
    # Totals per currency. Cancelled invoices count towards none of them.
    billed: list[MoneyTotal]
    paid: list[MoneyTotal]
    outstanding: list[MoneyTotal]


class ClientDetail(ClientSummary):
    projects: list[ProjectSummary]
    invoices: list[AdminInvoiceOut]


class ClientPatch(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None
