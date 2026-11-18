"""Offline contacts, invoices, part payments and receipts (staff only).

Money is whole minor units. Line amounts and totals are worked out by the
server; an `amount_cents` sent on a line is ignored.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from kleelab.schemas.project import Currency
from kleelab.services.offline import MAX_CENTS, line_amounts

PaymentMethod = Literal["bank_transfer", "cash", "other"]
OfflineInvoiceStatus = Literal["unpaid", "part_paid", "paid", "cancelled"]
ReceiptKind = Literal["payment", "standalone"]

EARLIEST = date(2000, 1, 1)
PHONE_PATTERN = r"^[0-9+()\-\s.]*$"
TOTAL_MESSAGE = "The total must be more than zero and at most 20,000,000.00"


def _trim(value: object) -> object:
    """Trim text, and save an empty string as null."""

    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _check_total(lines: list[LineIn] | None) -> None:
    if lines is None:
        return
    try:
        _, total = line_amounts(lines)
    except ValueError as exc:
        raise ValueError(str(exc)) from None
    if not 1 <= total <= MAX_CENTS:
        raise ValueError(TOTAL_MESSAGE)


def _check_day(value: date | None) -> date | None:
    if value is None:
        return value
    if value > date.today():
        raise ValueError("The date cannot be in the future")
    if value < EARLIEST:
        raise ValueError("The date cannot be before 2000")
    return value


def _one_contact(contact_id: UUID | None, contact: ContactIn | None) -> None:
    if (contact_id is None) == (contact is None):
        raise ValueError("Pick a saved contact or add a new one, not both")


# --- Contacts -------------------------------------------------------------------


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    company: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40, pattern=PHONE_PATTERN)
    address: str | None = Field(default=None, max_length=500)

    _trimmed = field_validator("name", "company", "email", "phone", "address", mode="before")(_trim)


class ContactPatch(BaseModel):
    """Only what is sent changes. Send a field as null to clear it (the name cannot be cleared)."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    company: str | None = Field(default=None, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40, pattern=PHONE_PATTERN)
    address: str | None = Field(default=None, max_length=500)
    # True archives the contact, false restores it.
    archived: bool | None = None

    _trimmed = field_validator("name", "company", "email", "phone", "address", mode="before")(_trim)


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    company: str | None
    email: str | None
    phone: str | None
    address: str | None
    archived_at: datetime | None
    created_at: datetime
    invoice_count: int = 0
    receipt_count: int = 0


# --- Lines ----------------------------------------------------------------------


class LineIn(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    quantity: int = Field(ge=1, le=10_000)
    unit_price_cents: int = Field(ge=0, le=MAX_CENTS)

    @field_validator("description", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class LineOut(LineIn):
    amount_cents: int


# --- Invoices -------------------------------------------------------------------


class OfflineInvoiceCreate(BaseModel):
    # Exactly one: a saved contact, or a new one saved with the invoice.
    contact_id: UUID | None = None
    contact: ContactIn | None = None
    title: str = Field(min_length=2, max_length=150)
    lines: list[LineIn] = Field(min_length=1, max_length=50)
    currency: Currency = "NGN"
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)

    _trimmed = field_validator("title", "notes", mode="before")(_trim)

    @model_validator(mode="after")
    def _rules(self) -> OfflineInvoiceCreate:
        _one_contact(self.contact_id, self.contact)
        _check_total(self.lines)
        return self


class OfflineInvoicePatch(BaseModel):
    """Only what is sent changes. Send a date as null to clear it; leave it out to keep it."""

    contact_id: UUID | None = None
    title: str | None = Field(default=None, min_length=2, max_length=150)
    lines: list[LineIn] | None = Field(default=None, min_length=1, max_length=50)
    currency: Currency | None = None
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)
    balance_promised_on: date | None = None

    _trimmed = field_validator("title", "notes", mode="before")(_trim)

    @model_validator(mode="after")
    def _rules(self) -> OfflineInvoicePatch:
        _check_total(self.lines)
        return self


class OfflineInvoiceSummary(BaseModel):
    id: UUID
    number: str
    title: str
    amount_cents: int
    paid_cents: int
    balance_cents: int
    currency: str
    status: OfflineInvoiceStatus
    due_date: date | None
    balance_promised_on: date | None
    created_at: datetime


class PaymentIn(BaseModel):
    amount_cents: int = Field(ge=1, le=MAX_CENTS)
    method: PaymentMethod
    reference: str | None = Field(default=None, max_length=100)
    # No later than today, no earlier than 2000-01-01.
    paid_on: date
    note: str | None = Field(default=None, max_length=500)

    _trimmed = field_validator("reference", "note", mode="before")(_trim)
    _day = field_validator("paid_on")(_check_day)


class VoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)

    @field_validator("reason", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class PaymentOut(BaseModel):
    id: UUID
    amount_cents: int
    method: PaymentMethod
    reference: str | None
    paid_on: date
    note: str | None
    recorded_by_name: str | None
    created_at: datetime
    voided_at: datetime | None
    void_reason: str | None
    receipt_id: UUID | None
    receipt_number: str | None


class OfflineInvoiceDetail(OfflineInvoiceSummary):
    contact: ContactOut
    bill_to_name: str
    bill_to_company: str | None
    bill_to_email: str | None
    bill_to_phone: str | None
    bill_to_address: str | None
    lines: list[LineOut]
    notes: str | None
    paid_at: datetime | None
    cancelled_at: datetime | None
    # Voided ones included, newest first.
    payments: list[PaymentOut]
    # Lines, title, currency and contact can still change.
    editable: bool
    # A balance is left and the promised date (or else the due date) has passed.
    overdue: bool


# --- Receipts -------------------------------------------------------------------


class StandaloneReceiptIn(BaseModel):
    """Money taken with no invoice. "Single amount" is one line with quantity 1."""

    contact_id: UUID | None = None
    contact: ContactIn | None = None
    currency: Currency = "NGN"
    lines: list[LineIn] = Field(min_length=1, max_length=50)
    method: PaymentMethod
    reference: str | None = Field(default=None, max_length=100)
    received_on: date
    note: str | None = Field(default=None, max_length=500)

    _trimmed = field_validator("reference", "note", mode="before")(_trim)
    _day = field_validator("received_on")(_check_day)

    @model_validator(mode="after")
    def _rules(self) -> StandaloneReceiptIn:
        _one_contact(self.contact_id, self.contact)
        _check_total(self.lines)
        return self


class ReceiptOut(BaseModel):
    id: UUID
    number: str
    kind: ReceiptKind
    contact_id: UUID
    bill_to_name: str
    currency: str
    amount_cents: int
    method: PaymentMethod
    reference: str | None
    received_on: date
    note: str | None
    voided_at: datetime | None
    void_reason: str | None
    created_at: datetime
    # Payment receipts only.
    invoice_id: UUID | None
    invoice_number: str | None
    invoice_total_cents: int | None
    paid_to_date_cents: int | None
    balance_after_cents: int | None
    # Standalone receipts only.
    lines: list[LineOut] | None


class ContactDetail(ContactOut):
    invoices: list[OfflineInvoiceSummary]
    receipts: list[ReceiptOut]


# --- Email ----------------------------------------------------------------------


class EmailIn(BaseModel):
    # Defaults to the contact's current email.
    to: EmailStr | None = None
    message: str | None = Field(default=None, max_length=2000)

    _trimmed = field_validator("to", "message", mode="before")(_trim)


class EmailSent(BaseModel):
    sent: bool
    to: str
