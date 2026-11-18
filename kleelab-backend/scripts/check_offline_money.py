"""Offline invoices, part payments and receipts: everything that needs no database.

Spec: docs/specs/2026-11-18-offline-invoices-receipts.md. This covers the pure
parts of acceptance criteria 1, 9, 10, 12, 14, 16, 17, 18, 20, 21, 22, 26-29, 31, 33 and 34:

* line amounts and totals in whole minor units, and the limits on them
* `recalculate`: paid, part paid, back after a void, the promise cleared once paid
* the overpayment rule's wording, and what the request schemas refuse
* overdue, with a promised date winning over the due date
* the PDFs render (including text outside Latin-1), carry the figures they
  should, and leave out voided payments
* the online invoice PDF is byte for byte what it was before the refactor
* an email carries its PDF as an attachment, escapes the staff message, and
  adds no `attachments` key when there are none; httpx and resend are faked
* every offline route is behind the staff guard

The flows that need a database (numbering under load, the payment race, void,
cancel, stats) are in scripts/db_checks/check_offline_money.py.

Run with `python scripts/check_offline_money.py`. No network, no database, no key.
"""

from __future__ import annotations

import base64
import os
import re
import sys
import zlib
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
os.environ.setdefault("DATABASE_URL", "postgresql://ci:ci@localhost:5432/kleelab")
os.environ.setdefault("SECRET_KEY", "ci-placeholder-secret-key-not-for-production")

from pydantic import ValidationError  # noqa: E402

from kleelab.core.config import settings  # noqa: E402
from kleelab.main import app  # noqa: E402
from kleelab.models.offline import OfflineInvoice, OfflineInvoicePayment, OfflineReceipt  # noqa: E402
from kleelab.models.project import Project, ProjectInvoice  # noqa: E402
from kleelab.models.user import User  # noqa: E402
from kleelab.routers.admin import require_staff  # noqa: E402
from kleelab.core import rate_limiter  # noqa: E402
from kleelab.schemas import offline as offline_schemas  # noqa: E402
from kleelab.schemas.offline import (  # noqa: E402
    ContactIn,
    EmailIn,
    OfflineInvoiceCreate,
    PaymentIn,
    ReceiptOut,
    StandaloneReceiptIn,
    VoidIn,
)
from kleelab.services import email as email_svc  # noqa: E402
from kleelab.services import invoice_pdf  # noqa: E402
from kleelab.services import offline as svc  # noqa: E402

FAILURES = 0


def check(message: str, condition: object, detail: str = "") -> None:
    global FAILURES
    if condition:
        print(f"PASS  {message}")
    else:
        FAILURES += 1
        print(f"FAIL  {message}" + (f" - {detail}" if detail else ""))


def raises(fn, exc=Exception) -> bool:
    try:
        fn()
    except exc:
        return True
    return False


def line(description: str, quantity: int, unit: int) -> dict:
    return {"description": description, "quantity": quantity, "unit_price_cents": unit}


TODAY = date.today()
settings.INVOICE_PAYMENT_DETAILS = "Bank: Test Bank\\nAccount: 0000000000"
settings.REPLY_TO_EMAIL = "hello@example.com"
settings.TEAM_INBOX = None


def pdf_text(data: bytes) -> str:
    """The text drawn on a PDF made by fpdf2: inflate each stream, then collect the strings."""

    out = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S):
        try:
            out.append(zlib.decompress(match.group(1)).decode("latin-1"))
        except zlib.error:
            out.append(match.group(1).decode("latin-1"))
    return "".join(re.findall(r"\((.*?)(?<!\\)\)\s*Tj", "".join(out)))


# --- Line amounts (criteria 9 and 10) ----------------------------------------------

print("\n-- line amounts --")
rows, total = svc.line_amounts([line("a", 3, 19_999), line("b", 1, 1), line("c", 2, 50_000_000)])
check("amounts are quantity times unit price", [r["amount_cents"] for r in rows] == [59_997, 1, 100_000_000])
check("the total is the sum of the lines", total == 100_059_998)
rows, total = svc.line_amounts([{**line("a", 2, 100), "amount_cents": 1}])
check("an amount sent on a line is ignored", rows[0]["amount_cents"] == 200 and total == 200)
check("every amount is an int, never a float", all(isinstance(r["amount_cents"], int) for r in rows) and isinstance(total, int))
_, big = svc.line_amounts([line("x", 10_000, 200_000)])
check("exactly the maximum is allowed", big == svc.MAX_CENTS == 2_000_000_000)
check("a line over the maximum raises", raises(lambda: svc.line_amounts([line("x", 10_000, 200_001)]), ValueError))
check(
    "lines that add up over the maximum raise",
    raises(lambda: svc.line_amounts([line("x", 1, 1_500_000_000), line("y", 1, 500_000_001)]), ValueError),
)
check("an object with the line fields works as well as a dict", svc.line_amounts([SimpleNamespace(**line("o", 4, 25))])[1] == 100)
check("money() formats with integers only", svc.money(6_000_000, "NGN") == "NGN 60,000.00" and svc.money(5, "USD") == "USD 0.05")
check("money() is exact above float precision", svc.money(2_000_000_001, "NGN") == "NGN 20,000,000.01")

print("\n-- request schemas --")
CONTACT = {"contact": {"name": "Bola Stores"}}


def create(**over) -> dict:
    return {**CONTACT, "title": "Website", "lines": [line("Build", 1, 100)], **over}


OfflineInvoiceCreate(**create())
check("a plain invoice is accepted and defaults to NGN", OfflineInvoiceCreate(**create()).currency == "NGN")
bad = {
    "total of 0": create(lines=[line("a", 1, 0)]),
    "total over 20,000,000.00": create(lines=[line("a", 1, 2_000_000_000), line("b", 1, 1)]),
    "quantity 0": create(lines=[line("a", 0, 100)]),
    "quantity 10001": create(lines=[line("a", 10_001, 1)]),
    "a negative price": create(lines=[line("a", 1, -1)]),
    "51 lines": create(lines=[line("a", 1, 1)] * 51),
    "no lines": create(lines=[]),
    "no contact": {"title": "Website", "lines": [line("a", 1, 1)]},
    "both contact_id and contact": create(contact_id="3f1c1d1e-1111-4111-8111-111111111111"),
    "a one-letter title": create(title="x"),
    "a bad currency": create(currency="JPY"),
    "an empty description": create(lines=[line("  ", 1, 1)]),
    "a float quantity": create(lines=[{"description": "a", "quantity": 1.5, "unit_price_cents": 100}]),
}
for label, payload in bad.items():
    check(f"an invoice with {label} is refused", raises(lambda p=payload: OfflineInvoiceCreate(**p), ValidationError))
check("50 lines is allowed", len(OfflineInvoiceCreate(**create(lines=[line("a", 1, 1)] * 50)).lines) == 50)
try:
    OfflineInvoiceCreate(**create(lines=[line("a", 1, 0)]))
except ValidationError as exc:
    check("the zero total says why", "The total must be more than zero and at most 20,000,000.00" in str(exc))
check(
    "a client-sent line amount is dropped by the schema",
    "amount_cents" not in OfflineInvoiceCreate(**create(lines=[{**line("a", 1, 5), "amount_cents": 999}])).lines[0].model_dump(),
)

ok_payment = {"amount_cents": 100, "method": "cash", "paid_on": TODAY}
check("a payment dated today is accepted", PaymentIn(**ok_payment).paid_on == TODAY)
for label, payload in {
    "tomorrow": {**ok_payment, "paid_on": TODAY + timedelta(days=1)},
    "before 2000": {**ok_payment, "paid_on": date(1999, 12, 31)},
    "an amount of 0": {**ok_payment, "amount_cents": 0},
    "a bad method": {**ok_payment, "method": "cheque"},
    "a float amount": {**ok_payment, "amount_cents": 10.5},
}.items():
    check(f"a payment with {label} is refused", raises(lambda p=payload: PaymentIn(**p), ValidationError))
check("2000-01-01 is the earliest allowed day", PaymentIn(**{**ok_payment, "paid_on": date(2000, 1, 1)}).paid_on == date(2000, 1, 1))
check("a void needs a reason of 3 characters", raises(lambda: VoidIn(reason="ab"), ValidationError) and VoidIn(reason="abc").reason == "abc")
check("a blank void reason is refused", raises(lambda: VoidIn(reason="    "), ValidationError))
check("a void reason over 300 is refused", raises(lambda: VoidIn(reason="x" * 301), ValidationError))
check(
    "a standalone receipt needs exactly one contact",
    raises(lambda: StandaloneReceiptIn(method="cash", received_on=TODAY, lines=[line("a", 1, 1)]), ValidationError),
)
check(
    "a standalone receipt in the future is refused",
    raises(
        lambda: StandaloneReceiptIn(**CONTACT, method="cash", received_on=TODAY + timedelta(days=1), lines=[line("a", 1, 1)]),
        ValidationError,
    ),
)
check("a contact's blank fields are saved as null", ContactIn(name="  Ada  ", company="  ", email=None).company is None)
check("a contact's name is trimmed", ContactIn(name="  Ada  ").name == "Ada")
check("a bad email on a contact is refused", raises(lambda: ContactIn(name="Ada", email="nope"), ValidationError))
check("a bad phone on a contact is refused", raises(lambda: ContactIn(name="Ada", phone="call me"), ValidationError))
check("an empty email to send to becomes 'use the contact's'", EmailIn(to="  ").to is None)
check("ReceiptOut has bill_to_email (the admin reads it to disable Email)", "bill_to_email" in ReceiptOut.model_fields)
check("and it is optional text", ReceiptOut.model_fields["bill_to_email"].annotation == (str | None))

# Review fix: "today" is the Lagos date, so 00:00-01:00 WAT is not refused by a UTC server.
lagos_now = (datetime.now(timezone.utc) + timedelta(hours=1)).date()
check("business_today() is the date in Lagos (UTC+1)", offline_schemas.business_today() == lagos_now)
_real_today = offline_schemas.business_today
offline_schemas.business_today = lambda: TODAY + timedelta(days=1)  # Lagos already past midnight
check(
    "a payment on Lagos's date is accepted when the server's date is still the day before",
    PaymentIn(**{**ok_payment, "paid_on": TODAY + timedelta(days=1)}).paid_on == TODAY + timedelta(days=1),
)
check(
    "a standalone receipt on Lagos's date is accepted too",
    StandaloneReceiptIn(**CONTACT, method="cash", received_on=TODAY + timedelta(days=1), lines=[line("a", 1, 1)]).received_on
    == TODAY + timedelta(days=1),
)
check(
    "the day after Lagos's date is still refused",
    raises(lambda: PaymentIn(**{**ok_payment, "paid_on": TODAY + timedelta(days=2)}), ValidationError),
)
offline_schemas.business_today = lambda: TODAY - timedelta(days=1)  # server ahead of Lagos
check("the server's own today is never refused", PaymentIn(**ok_payment).paid_on == TODAY)
offline_schemas.business_today = _real_today
check("the 2000-01-01 lower bound still holds", raises(lambda: PaymentIn(**{**ok_payment, "paid_on": date(1999, 12, 31)}), ValidationError))

# --- recalculate (criteria 12, 14, 16, 18, 21) ---------------------------------------

print("\n-- recalculate --")


def invoice(amount: int, **over) -> OfflineInvoice:
    values = dict(
        number="INV-0042", title="Website", lines=[], amount_cents=amount, currency="NGN", paid_cents=0, status="unpaid",
        bill_to_name="Bola Stores", created_at=datetime(2026, 11, 1),
    )
    values.update(over)
    return OfflineInvoice(**values)


def payment(amount: int, on: date | None = None, voided: bool = False, **over) -> OfflineInvoicePayment:
    values = dict(
        amount_cents=amount, method="bank_transfer", paid_on=on or TODAY,
        voided_at=datetime(2026, 11, 2) if voided else None, created_at=datetime(2026, 11, 1),
    )
    values.update(over)
    return OfflineInvoicePayment(**values)


inv = invoice(10_000_000)
svc.recalculate(inv, [])
check("no payments: unpaid, nothing paid", inv.status == "unpaid" and inv.paid_cents == 0 and inv.paid_at is None)
check("unpaid with nothing paid is editable", svc.is_editable(inv))
svc.recalculate(inv, [payment(4_000_000)])
check("40,000 of 100,000: part paid", inv.status == "part_paid" and inv.paid_cents == 4_000_000)
check("part paid: balance is 60,000.00", svc.balance(inv) == 6_000_000)
check("part paid is no longer editable", not svc.is_editable(inv))
check("part paid has no paid_at", inv.paid_at is None)
inv.balance_promised_on = TODAY + timedelta(days=7)
svc.recalculate(inv, [payment(4_000_000)])
check("a promise survives while there is a balance", inv.balance_promised_on == TODAY + timedelta(days=7))
first, second = payment(4_000_000, date(2026, 11, 3)), payment(6_000_000, date(2026, 11, 9))
svc.recalculate(inv, [first, second])
check("paid in full: paid", inv.status == "paid" and inv.paid_cents == inv.amount_cents)
check("paid_at is midnight of the latest payment date", inv.paid_at == datetime(2026, 11, 9, 0, 0, 0), str(inv.paid_at))
check("a promised date is cleared once paid", inv.balance_promised_on is None)
check("a paid invoice has no balance", svc.balance(inv) == 0)
second.voided_at = datetime(2026, 11, 10)
svc.recalculate(inv, [first, second])
check("voiding the last payment: back to part paid", inv.status == "part_paid" and inv.paid_cents == 4_000_000)
check("paid_at is cleared again", inv.paid_at is None)
first.voided_at = datetime(2026, 11, 10)
svc.recalculate(inv, [first, second])
check("voiding every payment: back to unpaid", inv.status == "unpaid" and inv.paid_cents == 0)
check("unpaid again means editable again", svc.is_editable(inv))
check("recalculate on a part payment keeps the invoice's own total", inv.amount_cents == 10_000_000)

tiny = invoice(6)
ones = [payment(1), payment(2), payment(3)]
svc.recalculate(tiny, ones)
check("1 + 2 + 3 cents on a 6 cent invoice is paid", tiny.status == "paid" and tiny.paid_cents == 6)
for i in range(3):
    for p in ones:
        p.voided_at = None
    ones[i].voided_at = datetime(2026, 11, 2)
    svc.recalculate(tiny, ones)
    check(
        f"after voiding the {ones[i].amount_cents} cent payment paid_cents is the sum of the rest",
        tiny.paid_cents == 6 - ones[i].amount_cents and tiny.status == "part_paid",
    )

cancelled = invoice(100, status="cancelled")
svc.recalculate(cancelled, [])
check("a cancelled invoice stays cancelled", cancelled.status == "cancelled" and cancelled.paid_cents == 0)
check("a cancelled invoice has no balance", svc.balance(cancelled) == 0)
check("a cancelled invoice is not editable", not svc.is_editable(cancelled))
check("a cancelled invoice is never overdue", not svc.is_overdue(invoice(100, status="cancelled", due_date=TODAY - timedelta(days=9))))

# --- Overdue, and the promised date (criterion 22) -------------------------------------

print("\n-- overdue --")
yesterday, next_week = TODAY - timedelta(days=1), TODAY + timedelta(days=7)
check("due yesterday and unpaid: overdue", svc.is_overdue(invoice(100, due_date=yesterday)))
check("due today: not overdue yet", not svc.is_overdue(invoice(100, due_date=TODAY)))
check("no dates: never overdue", not svc.is_overdue(invoice(100)))
check("a promise of yesterday is overdue", svc.is_overdue(invoice(100, paid_cents=40, status="part_paid", balance_promised_on=yesterday)))
check(
    "a promise next week beats a due date of yesterday",
    not svc.is_overdue(invoice(100, paid_cents=40, status="part_paid", due_date=yesterday, balance_promised_on=next_week)),
)
check(
    "a promise of yesterday beats a due date next week",
    svc.is_overdue(invoice(100, paid_cents=40, status="part_paid", due_date=next_week, balance_promised_on=yesterday)),
)
check("effective_due is the promise when there is one", svc.effective_due(invoice(100, due_date=yesterday, balance_promised_on=next_week)) == next_week)
check("effective_due falls back to the due date", svc.effective_due(invoice(100, due_date=yesterday)) == yesterday)
check("a paid invoice is not overdue whatever its dates", not svc.is_overdue(invoice(100, paid_cents=100, status="paid", due_date=yesterday)))
check("today can be given, for a fixed answer", svc.is_overdue(invoice(100, due_date=date(2026, 1, 1)), today=date(2026, 1, 2)))

# --- PDFs (criteria 27, 28, 29) ----------------------------------------------------------

print("\n-- PDFs --")
FIXED = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
_real_init = invoice_pdf._InvoicePDF.__init__


def _pinned_init(self, *args, **kwargs):
    _real_init(self, *args, **kwargs)
    self.creation_date = FIXED  # the only thing in a PDF that changes between runs


invoice_pdf._InvoicePDF.__init__ = _pinned_init

PROMISE = date(2026, 12, 12)
part = invoice(
    10_000_000, status="part_paid", paid_cents=4_000_000, balance_promised_on=PROMISE, due_date=date(2026, 11, 30),
    bill_to_name="Bola Stores", bill_to_company="Bola & Sons", bill_to_email="bola@example.com", bill_to_address="1 Road\nIkeja",
    lines=[{"description": "Shop sign build", "quantity": 1, "unit_price_cents": 10_000_000, "amount_cents": 10_000_000}],
    notes="Pay by transfer.",
)
live = payment(4_000_000, date(2026, 11, 3), reference="TRF-9")
gone = payment(1_000_000, date(2026, 11, 4), voided=True)
live_receipt = OfflineReceipt(number="RCT-0001")
gone_receipt = OfflineReceipt(number="RCT-0002")
live.receipt, gone.receipt = live_receipt, gone_receipt
text = pdf_text(invoice_pdf.render_offline_invoice_pdf(part, [live, gone]))
for needle in [
    "INV-0042", "Shop sign build", "Total", "Paid to date", "Balance due, promised by 12 Dec 2026", "PART PAID",
    "RCT-0001", "BALANCE DUE", "BILL TO", "Bola Stores", "Ikeja", "PROMISED", "QTY", "UNIT PRICE", "PAYMENTS", "HOW TO PAY", "Pay by transfer.",
    "Bank transfer", "TRF-9", "NGN 100,000.00", "NGN 40,000.00", "NGN 60,000.00",
]:
    check(f"part paid invoice PDF has {needle!r}", needle in text)
check("the voided payment's receipt number is left out", "RCT-0002" not in text)
check("the voided payment's amount is left out of the history", "NGN 10,000.00" not in text)
check("no pay link on an offline invoice", "paystack" not in text.lower())
check("the thanks line", "Thank you for working with KleeLab." in text)

unpaid = invoice(500_000, due_date=None, lines=[line("Logo", 1, 500_000) | {"amount_cents": 500_000}])
text = pdf_text(invoice_pdf.render_offline_invoice_pdf(unpaid, []))
check("unpaid: TOTAL DUE, due on receipt, how to pay", all(s in text for s in ["TOTAL DUE", "On receipt", "HOW TO PAY"]))
check("unpaid: no Paid to date, no PAYMENTS, no stamp, no PROMISED", not any(s in text for s in ["Paid to date", "PAYMENTS", "PART PAID", "PROMISED", "CANCELLED"]))

fully = invoice(
    100, status="paid", paid_cents=100, paid_at=datetime(2026, 11, 9), lines=[line("A", 1, 100) | {"amount_cents": 100}],
    balance_promised_on=None,
)
text = pdf_text(invoice_pdf.render_offline_invoice_pdf(fully, [payment(100, date(2026, 11, 9))]))
check("paid: TOTAL PAID and the PAID <date> stamp", "TOTAL PAID" in text and "PAID 9 NOV 2026" in text)
check("paid: no how to pay", "HOW TO PAY" not in text)

text = pdf_text(invoice_pdf.render_offline_invoice_pdf(invoice(100, status="cancelled", lines=[line("A", 1, 100) | {"amount_cents": 100}]), []))
check("cancelled: the CANCELLED stamp, no how to pay", "CANCELLED" in text and "HOW TO PAY" not in text)

ugly = "Ọlá Adé – “Shop” ₦"
odd = invoice(
    100, bill_to_name=ugly, bill_to_company=ugly, bill_to_address=ugly, notes=ugly,
    lines=[{"description": ugly, "quantity": 1, "unit_price_cents": 100, "amount_cents": 100}],
)
try:
    data = invoice_pdf.render_offline_invoice_pdf(odd, [])
    check("invoice with characters outside Latin-1 renders", data.startswith(b"%PDF"))
except Exception as exc:  # noqa: BLE001
    check("invoice with characters outside Latin-1 renders", False, repr(exc))
check("the invoice number never goes through a different filename", invoice_pdf.offline_pdf_filename("INV-0042") == "KleeLab-INV-0042.pdf")
check("receipt filename", invoice_pdf.offline_pdf_filename("RCT-0007") == "KleeLab-RCT-0007.pdf")


def receipt(**over) -> OfflineReceipt:
    values = dict(
        number="RCT-0007", kind="payment", currency="NGN", amount_cents=4_000_000, method="bank_transfer", reference="TRF-9",
        received_on=date(2026, 11, 3), bill_to_name="Bola Stores", invoice_total_cents=10_000_000, paid_to_date_cents=4_000_000,
        balance_after_cents=6_000_000, created_at=datetime(2026, 11, 3),
    )
    values.update(over)
    made = OfflineReceipt(**values)
    if values["kind"] == "payment":
        made.invoice = invoice(10_000_000, number="INV-0042", title="Website")
    return made


text = pdf_text(invoice_pdf.render_receipt_pdf(receipt()))
for needle in ["RECEIPT", "RCT-0007", "INV-0042", "Amount received", "Paid to date", "Balance due", "Invoice total", "RECEIVED FROM",
               "Bank transfer", "NGN 40,000.00", "NGN 60,000.00", "AMOUNT RECEIVED", "Reference: TRF-9"]:
    check(f"payment receipt PDF has {needle!r}", needle in text)
check("a live receipt has no VOID stamp", "VOID" not in text)
check("a payment receipt prints the figures saved on it", "NGN 100,000.00" in text)
text = pdf_text(invoice_pdf.render_receipt_pdf(receipt(voided_at=datetime(2026, 11, 20), void_reason="Entered twice")))
check("a voided receipt shows VOID with its date", "VOID 20 NOV 2026" in text)
fresh_invoice_figures = receipt(invoice_total_cents=1, paid_to_date_cents=2, balance_after_cents=3)
check(
    "a re-download prints the saved figures, not the invoice's",
    all(s in pdf_text(invoice_pdf.render_receipt_pdf(fresh_invoice_figures)) for s in ["NGN 0.01", "NGN 0.02", "NGN 0.03"]),
)
direct = receipt(
    kind="standalone", number="RCT-0008", amount_cents=10_000, method="cash", reference=None, note="Screen repair",
    invoice_total_cents=None, paid_to_date_cents=None, balance_after_cents=None,
    lines=[{"description": "Repair", "quantity": 2, "unit_price_cents": 5_000, "amount_cents": 10_000}],
)
text = pdf_text(invoice_pdf.render_receipt_pdf(direct))
check("a standalone receipt says Direct payment and has the item table", all(s in text for s in ["Direct payment", "QTY", "Repair", "NGN 100.00"]))
check("a standalone receipt has no invoice figures", "Invoice total" not in text and "Balance due" not in text)
check("a standalone receipt prints its note", "Note: Screen repair" in text)
try:
    data = invoice_pdf.render_receipt_pdf(
        receipt(kind="standalone", bill_to_name=ugly, bill_to_address=ugly, note=ugly, reference=ugly, invoice_total_cents=None,
                paid_to_date_cents=None, balance_after_cents=None,
                lines=[{"description": ugly, "quantity": 1, "unit_price_cents": 100, "amount_cents": 100}])
    )
    check("receipt with characters outside Latin-1 renders", data.startswith(b"%PDF"))
except Exception as exc:  # noqa: BLE001
    check("receipt with characters outside Latin-1 renders", False, repr(exc))
lots = invoice(
    50 * 100, lines=[{"description": f"Item {i} " + "word " * 30, "quantity": 1, "unit_price_cents": 100, "amount_cents": 100} for i in range(50)],
)
check("50 long lines still render (pages break)", invoice_pdf.render_offline_invoice_pdf(lots, []).count(b"/Type /Page\n") >= 1)

# --- The online invoice PDF is untouched (criterion 26) ----------------------------------------

print("\n-- online invoice PDF, byte for byte --")
# Recorded from `main` before the refactor (git HEAD's services/invoice_pdf.py), with the
# fixed creation date above, the payment details set above, and this fixture.
GOLDEN = {
    "unpaid": "582076bfccc2ffb38dfdc7c8880c7470642c0398fb4f84da48429730376311f0",
    "paid": "385c0951363e32679c7d8358322eee15de52a44d7cac74cb58f6d0edada269b6",
    "cancelled": "9567e0da0a6a8f014cb9e871145a5e0146e38cd2067161cfb32c43db2861436f",
}


def online(status: str) -> tuple[ProjectInvoice, Project]:
    project = Project(reference="T-1", title="Fabric shop — online")
    project.client = User(email="c@example.com", full_name="Ọlá Adé – “Shop”")
    return (
        ProjectInvoice(
            number="INV-0042", title="Deposit, 50% of the build", amount_cents=15_000_000, currency="NGN", status=status,
            created_at=datetime(2026, 11, 1), due_date=date(2026, 11, 20), pay_url="https://paystack.com/pay/example",
            paid_at=datetime(2026, 11, 10),
        ),
        project,
    )


import hashlib  # noqa: E402

for status, expected in GOLDEN.items():
    got = hashlib.sha256(invoice_pdf.render_invoice_pdf(*online(status))).hexdigest()
    check(f"online invoice PDF ({status}) hash is unchanged", got == expected, got)
check("online invoice PDF is deterministic", invoice_pdf.render_invoice_pdf(*online("unpaid")) == invoice_pdf.render_invoice_pdf(*online("unpaid")))
check("online invoice filename is unchanged", invoice_pdf.pdf_filename(online("paid")[0]) == "KleeLab-INV-0042.pdf")
online_text = pdf_text(invoice_pdf.render_invoice_pdf(*online("unpaid")))
check("online invoice still says Thank you for building with KleeLab.", "Thank you for building with KleeLab." in online_text)
check("online invoice has no QTY column", "QTY" not in online_text)
invoice_pdf._InvoicePDF.__init__ = _real_init

# --- Email (criteria 31, 33, 34) ------------------------------------------------------------------

print("\n-- email --")
sent: list[dict] = []
resend_sent: list[dict] = []
network: list[str] = []


class FakeResponse:
    def raise_for_status(self) -> None:
        return None


def fake_post(url, headers=None, json=None, timeout=None):
    network.append(url)
    sent.append(json)
    return FakeResponse()


email_svc.httpx.post = fake_post
# The pinned resend (0.1.0) has no `Emails` at all, so the Resend path cannot run for real
# here; the fake stands in for the newer client the code is written against.
email_svc.resend.Emails = SimpleNamespace(send=lambda message: resend_sent.append(message) or {"id": "x"})
settings.MAILTRAP_API_TOKEN = "test-token"
settings.RESEND_API_KEY = ""

pdf = b"%PDF-1.4 fake pdf bytes"
note = "Hi <b>there</b> & <script>alert(1)</script>\n\nSecond paragraph\nsame paragraph"
ok = email_svc.send_offline_invoice_email(
    "bola@example.com", "Bola <Stores>", "INV-0042", "NGN 100,000.00", "NGN 60,000.00", "12 Dec 2026", note, pdf
)
payload = sent[-1]
att = payload.get("attachments", [])
check("invoice email is accepted", ok is True)
check("one attachment", len(att) == 1)
check("attachment named KleeLab-INV-0042.pdf", att and att[0]["filename"] == "KleeLab-INV-0042.pdf")
check("attachment type and disposition", att and att[0]["type"] == "application/pdf" and att[0]["disposition"] == "attachment")
check("attachment content is base64 of the PDF", att and base64.b64decode(att[0]["content"]) == pdf)
check("the attachment decodes to bytes starting %PDF", att and base64.b64decode(att[0]["content"]).startswith(b"%PDF"))
check("staff message is HTML-escaped", "&lt;b&gt;there&lt;/b&gt;" in payload["html"] and "<script>" not in payload["html"])
check("a script in the message is not left live", "&lt;script&gt;alert(1)&lt;/script&gt;" in payload["html"])
check("paragraphs and line breaks are kept", "Second paragraph<br>same paragraph" in payload["html"])
check("the contact's name is escaped", "Bola &lt;Stores&gt;" in payload["html"])
check("the heading is the balance due", "NGN 60,000.00 due" in payload["html"])
check("the subject names the invoice", payload["subject"] == "KleeLab invoice INV-0042")
check("sent to the address given", payload["to"] == [{"email": "bola@example.com"}])
check("reply-to is the team's address", payload.get("headers") == {"Reply-To": "hello@example.com"})
check("footer says why they got it", "You are getting this because you did business with KleeLab." in payload["html"])
check("no dashboard button", "dashboard" not in payload["html"].lower())
check("sent to the Mailtrap API only", network == [email_svc.MAILTRAP_SEND_URL])

email_svc.send_offline_invoice_email("a@example.com", None, "INV-0043", "NGN 5.00", None, None, None, pdf)
check("a fully paid invoice's heading is Invoice <number>", "Invoice INV-0043" in sent[-1]["html"] and "fully paid" in sent[-1]["html"])
check("a missing name reads Hi there", "Hi there," in sent[-1]["html"])

ok = email_svc.send_offline_receipt_email(
    "bola@example.com", "Bola", "RCT-0007", "NGN 40,000.00", "INV-0042", "NGN 60,000.00", "Thanks <i>so</i> much", pdf
)
payload = sent[-1]
att = payload.get("attachments", [])
check("receipt email is accepted", ok is True)
check("receipt attachment is KleeLab-RCT-0007.pdf", len(att) == 1 and att[0]["filename"] == "KleeLab-RCT-0007.pdf" and att[0]["type"] == "application/pdf")
check("receipt heading says we received the amount", "Thank you: we received NGN 40,000.00" in payload["html"])
check("receipt message is escaped", "Thanks &lt;i&gt;so&lt;/i&gt; much" in payload["html"])
check("receipt says what is still to pay", "NGN 60,000.00 is still to pay on INV-0042" in payload["html"])
email_svc.send_offline_receipt_email("bola@example.com", "Bola", "RCT-0008", "NGN 60,000.00", "INV-0042", None, None, pdf)
check("a receipt that settles the invoice says so", "INV-0042 is now fully paid" in sent[-1]["html"])
email_svc.send_offline_receipt_email("bola@example.com", "Bola", "RCT-0009", "NGN 1.00", None, None, None, pdf)
check("a direct receipt mentions no invoice", "against invoice" not in sent[-1]["html"] and "still to pay" not in sent[-1]["html"])

before = len(sent)
big = b"x" * (email_svc.MAX_ATTACHMENT_BYTES + 1)
import logging  # noqa: E402

big_records: list[logging.LogRecord] = []


class _CollectBig(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        big_records.append(record)


_big_handler = _CollectBig()
email_svc.logger.addHandler(_big_handler)
check(
    "an attachment over 5 MB is refused with False",
    email_svc.send_offline_invoice_email("bigsender@example.com", "A", "INV-1", "NGN 1.00", None, None, None, big) is False,
)
email_svc.logger.removeHandler(_big_handler)
big_logged = " ".join(r.getMessage() for r in big_records)
check("and nothing is sent", len(sent) == before)
check("the 5 MB log line names the document", "over 5 MB" in big_logged and "INV-1" in big_logged, big_logged)
check("the 5 MB log line never has the recipient's address", "bigsender@example.com" not in big_logged and "bigsender" not in big_logged, big_logged)
check("it logs a masked address instead", "b***@example.com" in big_logged, big_logged)
check("mask_address keeps one letter and the domain", email_svc.mask_address("ada@example.com") == "a***@example.com")
check("mask_address of something that is not an address is ***", email_svc.mask_address("nope") == "***" and email_svc.mask_address("") == "***")
at_limit = b"x" * email_svc.MAX_ATTACHMENT_BYTES
check(
    "exactly 5 MB is still allowed",
    email_svc.send_offline_invoice_email("a@example.com", "A", "INV-1", "NGN 1.00", None, None, None, at_limit) is True,
)

# Existing emails: same payload, no attachments key (criterion 34).
sent.clear()
email_svc.send_password_reset_email("ada@example.com", "tok123")
email_svc.send_invoice_reminder  # noqa: B018  (imported name exists)
email_svc.send_lead_reply("ada@example.com", "Hello", "Body", "Ada")
check("password reset and lead reply send", len(sent) == 2)
check("no `attachments` key when there are none", all("attachments" not in p for p in sent))
check("existing emails keep their other keys", all({"from", "to", "subject", "html", "text"} <= set(p) for p in sent))
check("lead reply still has its Reply-To header", "headers" in sent[1])

# Resend path, faked: base64 content and filename, and the key only when needed.
settings.MAILTRAP_API_TOKEN = ""
settings.RESEND_API_KEY = "re_test"
email_svc.send_offline_invoice_email("a@example.com", "A", "INV-7", "NGN 1.00", "NGN 1.00", None, None, pdf)
email_svc.send_password_reset_email("ada@example.com", "tok123")
check(
    "Resend gets base64 content and the filename",
    resend_sent[0]["attachments"] == [{"filename": "KleeLab-INV-7.pdf", "content": base64.b64encode(pdf).decode()}],
)
check("Resend: no attachments key on an ordinary email", "attachments" not in resend_sent[1])

# No provider: the bytes are never logged.
import logging  # noqa: E402

settings.RESEND_API_KEY = ""
settings.ENVIRONMENT = "development"
records: list[logging.LogRecord] = []


class Collect(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        records.append(record)


handler = Collect()
email_svc.logger.propagate = False  # keep the development fallback's body out of the check output
email_svc.logger.addHandler(handler)
result = email_svc.send_offline_invoice_email("a@example.com", "A", "INV-8", "NGN 1.00", None, None, None, b"%PDF-SECRET-BYTES")
email_svc.logger.removeHandler(handler)
email_svc.logger.propagate = True
logged = " ".join(r.getMessage() for r in records)
check("no provider: returns False", result is False)
check("no provider: the log says how many attachments", "with 1 attachment(s)" in logged, logged[:200])
check("no provider: the log never has the bytes", "SECRET-BYTES" not in logged and "JVBER" not in logged)

failing_calls = 0


def failing_post(*args, **kwargs):
    global failing_calls
    failing_calls += 1
    raise email_svc.httpx.ConnectError("down")


settings.MAILTRAP_API_TOKEN = "test-token"
email_svc.httpx.post = failing_post
check(
    "a provider that fails gives False, not a traceback",
    email_svc.send_offline_receipt_email("a@example.com", "A", "RCT-1", "NGN 1.00", None, None, None, pdf) is False and failing_calls == 1,
)
settings.MAILTRAP_API_TOKEN = ""

# --- Routes (criterion 1) ----------------------------------------------------------------------------

print("\n-- routes --")
routes = [r for r in app.routes if getattr(r, "path", "").startswith("/api/admin/offline")]
methods = sorted((m, r.path) for r in routes for m in r.methods if m != "HEAD")
check("20 offline routes are mounted", len(methods) == 20, str(len(methods)))
expected = {
    ("GET", "/api/admin/offline/contacts"), ("POST", "/api/admin/offline/contacts"),
    ("GET", "/api/admin/offline/contacts/{contact_id}"), ("PATCH", "/api/admin/offline/contacts/{contact_id}"),
    ("DELETE", "/api/admin/offline/contacts/{contact_id}"),
    ("POST", "/api/admin/offline/invoices"), ("GET", "/api/admin/offline/invoices/{invoice_id}"),
    ("PATCH", "/api/admin/offline/invoices/{invoice_id}"), ("POST", "/api/admin/offline/invoices/{invoice_id}/cancel"),
    ("POST", "/api/admin/offline/invoices/{invoice_id}/reopen"), ("POST", "/api/admin/offline/invoices/{invoice_id}/payments"),
    ("POST", "/api/admin/offline/invoices/{invoice_id}/payments/{payment_id}/void"),
    ("GET", "/api/admin/offline/invoices/{invoice_id}/pdf"), ("POST", "/api/admin/offline/invoices/{invoice_id}/email"),
    ("GET", "/api/admin/offline/receipts"), ("POST", "/api/admin/offline/receipts"),
    ("GET", "/api/admin/offline/receipts/{receipt_id}"), ("POST", "/api/admin/offline/receipts/{receipt_id}/void"),
    ("GET", "/api/admin/offline/receipts/{receipt_id}/pdf"), ("POST", "/api/admin/offline/receipts/{receipt_id}/email"),
}
check("every route in the spec exists", expected == set(methods), str(expected ^ set(methods)))


def guarded(route) -> bool:
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        if dep.call is require_staff:
            return True
        stack.extend(dep.dependencies)
    return False


unguarded = [r.path for r in routes if not guarded(r)]
check("every offline route is behind require_staff", not unguarded, str(unguarded))
check("no offline route is public (no route without a guard)", len(routes) > 0 and not unguarded)
delete_route = next(r for r in routes if r.path.endswith("/contacts/{contact_id}") and "DELETE" in r.methods)
check("DELETE /contacts/{id} answers 204", delete_route.status_code == 204)
receipts_route = next(r for r in routes if r.path == "/api/admin/offline/receipts" and "GET" in r.methods)
params = {p.name: p for p in receipts_route.dependant.query_params}
check("GET /receipts takes limit and offset", {"limit", "offset"} <= set(params), sorted(params))
check("limit defaults to 200", params["limit"].field_info.default == 200)

# --- Strict budget on the two email routes (review fix) ---------------------------------

print("\n-- email rate limit --")
email_paths = [
    "/api/admin/offline/invoices/3f1c1d1e-1111-4111-8111-111111111111/email",
    "/api/admin/offline/receipts/3f1c1d1e-1111-4111-8111-111111111111/email",
]
check("both email routes get the strict bucket", all(rate_limiter.is_offline_email("POST", p) for p in email_paths))
for method, path in (
    ("GET", email_paths[0]),
    ("POST", "/api/admin/offline/invoices/x/pdf"),
    ("POST", "/api/admin/offline/receipts"),
    ("POST", "/api/admin/offline/invoices/x/email/extra"),
    ("POST", "/api/admin/offline/contacts/x/email"),
    ("POST", "/api/admin/invoices/x/email"),
):
    check(f"{method} {path} is not in the email bucket", not rate_limiter.is_offline_email(method, path))
check("the default email budget is 5 a minute", type(settings).model_fields["OFFLINE_EMAIL_RATE_LIMIT_PER_MINUTE"].default == 5)

import asyncio  # noqa: E402

import httpx  # noqa: E402


async def email_budget() -> tuple[list[int], int, int]:
    settings.OFFLINE_EMAIL_RATE_LIMIT_PER_MINUTE = 5
    transport = httpx.ASGITransport(app=app, client=("10.7.0.1", 1234))
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        # No token: every one is turned away by the staff guard, after the limiter has counted it.
        codes = [(await c.post(email_paths[i % 2], json={})).status_code for i in range(6)]
        other = (await c.get("/api/admin/offline/receipts")).status_code
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=("10.7.0.2", 1234)), base_url="http://t") as c:
        fresh = (await c.post(email_paths[0], json={})).status_code
    return codes, other, fresh


codes, other, fresh = asyncio.run(email_budget())
check("emails 1-5 in a minute are not limited", 429 not in codes[:5], str(codes))
check("the 6th email in a minute is 429, invoice and receipt sharing one budget", codes[5] == 429, str(codes))
check("other offline routes are not held back by the email budget", other != 429, str(other))
check("another address has its own budget", fresh != 429, str(fresh))

print()
if FAILURES:
    print(f"{FAILURES} check(s) failed")
    sys.exit(1)
print("All offline money checks passed")
