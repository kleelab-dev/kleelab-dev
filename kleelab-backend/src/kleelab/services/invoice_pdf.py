"""Invoice and receipt PDFs, in the KleeLab "blueprint" look: ink lines, a cobalt pen, hard shadows.

Uses fpdf2's built-in Helvetica, which only covers Latin-1. Everything printed goes
through `_t`, which swaps typographic punctuation for plain characters and drops
accents it cannot print, so an odd character in a title never breaks a download.
Amounts are written with the currency code ("NGN 150,000.00") for the same reason.
"""

from __future__ import annotations

import unicodedata
from datetime import date, datetime
from urllib.parse import urlparse

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from kleelab.core.config import settings
from kleelab.models.offline import OfflineInvoice, OfflineInvoicePayment, OfflineReceipt
from kleelab.models.project import Project, ProjectInvoice

INK = (14, 21, 48)
COBALT = (35, 64, 232)
MUTED = (91, 99, 128)
LINE = (217, 221, 234)
PAPER = (244, 246, 252)
DANGER = (200, 40, 40)

_PLAIN = {
    "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"',
    "•": "*", "…": "...", " ": " ", "₦": "NGN ", "→": "->",
}


def _t(text: str | None) -> str:
    out = []
    for char in text or "":
        char = _PLAIN.get(char, char)
        try:
            char.encode("latin-1")
            out.append(char)
            continue
        except UnicodeEncodeError:
            pass
        base = "".join(c for c in unicodedata.normalize("NFKD", char) if not unicodedata.combining(c))
        try:
            base.encode("latin-1")
            out.append(base)
        except UnicodeEncodeError:
            out.append("?")
    return "".join(out)


def _lines(value: str | None) -> list[str]:
    if not value:
        return []
    return [line.strip() for line in value.replace("\\n", "\n").splitlines() if line.strip()]


def money(cents: int, currency: str) -> str:
    return f"{currency} {cents / 100:,.2f}"


def _day(value: date | datetime | None) -> str:
    return f"{value.day} {value:%b %Y}" if value else "-"


def _site() -> str:
    host = urlparse(settings.FRONTEND_URL).netloc or "kleelab.com"
    return host.removeprefix("www.")


class _InvoicePDF(FPDF):
    def footer(self) -> None:
        self.set_y(-18)
        self.set_draw_color(*INK)
        self.set_line_width(0.5)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(3)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        contact = settings.REPLY_TO_EMAIL or settings.TEAM_INBOX
        parts = ["KleeLab", _site()] + ([contact] if contact else [])
        self.cell(0, 4, _t("  |  ".join(parts)), align="L")
        self.cell(0, 4, f"Page {self.page_no()}", align="R")


# --- Building blocks, shared by every document ---------------------------------------
#
# render_invoice_pdf must print byte for byte what it printed before these were
# split out (spec 2026-11-18, criterion 26), so keep the drawing calls in order.

AMOUNT_W = 48
BOX_H = 22


def _width(pdf: FPDF) -> float:
    return pdf.w - pdf.l_margin - pdf.r_margin


def _new_pdf(title: str) -> FPDF:
    pdf = _InvoicePDF(format="A4", unit="mm")
    pdf.set_margins(18, 18, 18)
    pdf.set_auto_page_break(True, margin=24)
    pdf.set_title(_t(title))
    pdf.set_author("KleeLab")
    pdf.set_creator("KleeLab")
    pdf.add_page()
    return pdf


def _header(pdf: FPDF, word: str, number: str) -> None:
    """The wordmark, and the document word ("INVOICE" or "RECEIPT") and number on the right."""

    width = _width(pdf)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(*INK)
    pdf.cell(pdf.get_string_width("Klee"), 11, "Klee")
    pdf.set_text_color(*COBALT)
    pdf.cell(pdf.get_string_width("Lab"), 11, "Lab")
    pdf.set_xy(pdf.l_margin, 18)
    pdf.set_font("Courier", "B", 9)
    pdf.set_text_color(*COBALT)
    pdf.cell(width, 4, word, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*INK)
    pdf.cell(width, 8, _t(number), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(4)
    pdf.set_draw_color(*INK)
    pdf.set_line_width(0.6)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(8)


def _parties(pdf: FPDF, right_label: str, right_lines: list[str]) -> None:
    """KleeLab on the left (FROM), the customer on the right."""

    half = _width(pdf) / 2
    top = pdf.get_y()

    def block(x: float, label: str, lines: list[str], bold_first: bool = True) -> float:
        pdf.set_xy(x, top)
        pdf.set_font("Courier", "B", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(half - 6, 5, label, new_x=XPos.LEFT, new_y=YPos.NEXT)
        for index, line in enumerate(lines):
            pdf.set_x(x)
            pdf.set_font("Helvetica", "B" if index == 0 and bold_first else "", 10.5 if index == 0 else 9.5)
            pdf.set_text_color(*(INK if index == 0 else MUTED))
            pdf.multi_cell(half - 6, 5, _t(line), new_x=XPos.LEFT, new_y=YPos.NEXT)
        return pdf.get_y()

    contact = settings.REPLY_TO_EMAIL or settings.TEAM_INBOX
    from_lines = ["KleeLab", *_lines(settings.INVOICE_FROM_ADDRESS)] + ([contact] if contact else [])
    bottom = max(block(pdf.l_margin, "FROM", from_lines), block(pdf.l_margin + half, right_label, right_lines))
    pdf.set_y(bottom + 8)


def _facts(pdf: FPDF, facts: list[tuple[str, str]]) -> None:
    """Key facts in a soft band, one column each (three or four)."""

    width = _width(pdf)
    band_y = pdf.get_y()
    pdf.set_fill_color(*PAPER)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.3)
    pdf.rect(pdf.l_margin, band_y, width, 16, style="DF")
    column = width / len(facts)
    for index, (label, value) in enumerate(facts):
        x = pdf.l_margin + index * column + 4
        pdf.set_xy(x, band_y + 3)
        pdf.set_font("Courier", "B", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(column - 6, 4, label)
        pdf.set_xy(x, band_y + 8)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*INK)
        pdf.cell(column - 6, 5, _t(value))
    pdf.set_y(band_y + 16 + 10)


def _items(pdf: FPDF, rows: list[dict], with_qty: bool) -> None:
    """The line items.

    Each row is {"title", "subtitle" (optional), "amount"}, plus "qty" and
    "unit" when `with_qty`. Without it the table is DESCRIPTION / AMOUNT.
    """

    width = _width(pdf)
    amount_w = 38 if with_qty else AMOUNT_W
    qty_w, unit_w = (16, 36) if with_qty else (0, 0)
    desc_w = width - amount_w - qty_w - unit_w
    pdf.set_font("Courier", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(desc_w, 6, "DESCRIPTION")
    if with_qty:
        pdf.cell(qty_w, 6, "QTY", align="R")
        pdf.cell(unit_w, 6, "UNIT PRICE", align="R")
    pdf.cell(amount_w, 6, "AMOUNT", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_draw_color(*INK)
    pdf.set_line_width(0.4)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(3)
    for index, row in enumerate(rows):
        if index:
            pdf.ln(3)
        # Start a row on a fresh page rather than split it from its amount.
        if pdf.get_y() + 14 > pdf.page_break_trigger:
            pdf.add_page()
        row_y = pdf.get_y()
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*INK)
        pdf.multi_cell(desc_w - 4, 6, _t(row["title"]), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if row.get("subtitle"):
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*MUTED)
            pdf.multi_cell(desc_w - 4, 5, _t(row["subtitle"]), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        after = pdf.get_y()
        pdf.set_xy(pdf.l_margin + desc_w, row_y)
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(*INK)
        if with_qty:
            pdf.cell(qty_w, 6, _t(str(row["qty"])), align="R")
            pdf.cell(unit_w, 6, _t(row["unit"]), align="R")
        pdf.cell(amount_w, 6, _t(row["amount"]), align="R")
        pdf.set_y(after + 3)
        pdf.set_draw_color(*LINE)
        pdf.set_line_width(0.3)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(8)


def _sums(pdf: FPDF, rows: list[tuple[str, str]]) -> None:
    """Right-aligned label and amount pairs under the table. The last one is bold."""

    width = _width(pdf)
    pdf.set_y(pdf.get_y() - 4)
    for index, (label, amount) in enumerate(rows):
        last = index == len(rows) - 1
        pdf.set_font("Helvetica", "B" if last else "", 10)
        pdf.set_text_color(*(INK if last else MUTED))
        pdf.cell(width - AMOUNT_W, 6, _t(label), align="R")
        pdf.set_text_color(*INK)
        pdf.cell(AMOUNT_W, 6, _t(amount), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)


def _total_box(pdf: FPDF, label: str, amount: str) -> float:
    """The total, in a box with the house hard shadow. Returns the box's top."""

    box_w, box_h = 82, BOX_H
    box_x = pdf.w - pdf.r_margin - box_w - 2
    if pdf.get_y() + box_h + 4 > pdf.page_break_trigger:
        pdf.add_page()
    box_y = pdf.get_y()
    pdf.set_fill_color(*INK)
    pdf.rect(box_x + 2, box_y + 2, box_w, box_h, style="F")
    pdf.set_fill_color(255, 255, 255)
    pdf.set_draw_color(*INK)
    pdf.set_line_width(0.6)
    pdf.rect(box_x, box_y, box_w, box_h, style="DF")
    pdf.set_xy(box_x + 5, box_y + 3.5)
    pdf.set_font("Courier", "B", 8)
    pdf.set_text_color(*COBALT)
    pdf.cell(box_w - 10, 4, label)
    pdf.set_xy(box_x + 5, box_y + 9)
    pdf.set_font("Helvetica", "B", 17)
    pdf.set_text_color(*INK)
    pdf.cell(box_w - 10, 9, _t(amount), align="R")
    return box_y


def _after_box(pdf: FPDF, box_y: float) -> None:
    pdf.set_y(box_y + BOX_H + 14)


def _stamp(pdf: FPDF, text: str, colour: tuple[int, int, int], y: float) -> None:
    """A rotated rubber stamp beside the total box, whose top is `y`."""

    pdf.set_font("Courier", "B", 13)
    stamp_w = pdf.get_string_width(text) + 10
    sx, sy = pdf.l_margin + 6, y + 4
    with pdf.rotation(8, sx + stamp_w / 2, sy + 6):
        pdf.set_draw_color(*colour)
        pdf.set_line_width(0.9)
        pdf.rect(sx, sy, stamp_w, 12)
        pdf.set_xy(sx, sy + 2.5)
        pdf.set_text_color(*colour)
        pdf.cell(stamp_w, 7, text, align="C")


def _how_to_pay(pdf: FPDF, number: str, pay_url: str | None, details: list[str]) -> None:
    width = _width(pdf)
    pdf.set_font("Courier", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(width, 5, "HOW TO PAY", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)
    if pay_url:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*INK)
        pdf.cell(pdf.get_string_width("Pay online: ") + 1, 6, "Pay online: ")
        pdf.set_text_color(*COBALT)
        pdf.set_font("Helvetica", "U", 10)
        pdf.multi_cell(0, 6, _t(pay_url), link=pay_url, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if details:
        if pay_url:
            pdf.ln(1)
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*INK)
            pdf.cell(width, 6, "Or by bank transfer:", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*INK)
        for line in details:
            pdf.multi_cell(width, 5.5, _t(line), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.ln(1)
    pdf.multi_cell(width, 5, _t(f"Please use {number} as the payment reference."), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)


def _labelled(pdf: FPDF, label: str, lines: list[str]) -> None:
    """A small label with plain lines under it (notes, receipt details)."""

    width = _width(pdf)
    pdf.set_font("Courier", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(width, 5, label, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*INK)
    for line in lines:
        pdf.multi_cell(width, 5.5, _t(line), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)


def _thanks(pdf: FPDF, text: str) -> None:
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*INK)
    pdf.cell(_width(pdf), 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)


# --- Online (project) invoices -------------------------------------------------------


def render_invoice_pdf(invoice: ProjectInvoice, project: Project) -> bytes:
    client = project.client
    pdf = _new_pdf(f"Invoice {invoice.number}")
    _header(pdf, "INVOICE", invoice.number)
    bill_lines = [
        (client.full_name if client else None) or (client.email if client else "Client"),
        *([client.email] if client and client.full_name else []),
    ]
    _parties(pdf, "BILL TO", bill_lines)
    _facts(pdf, [
        ("INVOICE NO.", invoice.number),
        ("ISSUED", _day(invoice.created_at)),
        ("DUE", _day(invoice.due_date) if invoice.due_date else "On receipt"),
        ("PROJECT", project.reference),
    ])
    _items(pdf, [{
        "title": invoice.title,
        "subtitle": f"{project.title} ({project.reference})",
        "amount": money(invoice.amount_cents, invoice.currency),
    }], with_qty=False)

    label = "TOTAL PAID" if invoice.status == "paid" else "TOTAL DUE" if invoice.status == "unpaid" else "TOTAL"
    box_y = _total_box(pdf, label, money(invoice.amount_cents, invoice.currency))
    # A stamp for anything that is no longer waiting to be paid.
    if invoice.status in ("paid", "cancelled"):
        colour = COBALT if invoice.status == "paid" else DANGER
        text = f"PAID {_day(invoice.paid_at).upper()}" if invoice.status == "paid" and invoice.paid_at else invoice.status.upper()
        _stamp(pdf, text, colour, box_y)
    _after_box(pdf, box_y)

    # How to pay, only while there is something to pay.
    details = _lines(settings.INVOICE_PAYMENT_DETAILS)
    if invoice.status == "unpaid" and (invoice.pay_url or details):
        _how_to_pay(pdf, invoice.number, invoice.pay_url, details)
    _thanks(pdf, "Thank you for building with KleeLab.")
    return bytes(pdf.output())


def pdf_filename(invoice: ProjectInvoice) -> str:
    return f"KleeLab-{invoice.number}.pdf"


# --- Offline invoices and receipts ---------------------------------------------------

METHOD_LABELS = {"bank_transfer": "Bank transfer", "cash": "Cash", "other": "Other"}
OFFLINE_THANKS = "Thank you for working with KleeLab."


def _bill_to_lines(document: OfflineInvoice | OfflineReceipt) -> list[str]:
    return [
        document.bill_to_name,
        *([document.bill_to_company] if document.bill_to_company else []),
        *_lines(document.bill_to_address),
        *([document.bill_to_email] if document.bill_to_email else []),
        *([document.bill_to_phone] if document.bill_to_phone else []),
    ]


def _line_rows(lines: list[dict], currency: str) -> list[dict]:
    return [
        {
            "title": line["description"],
            "qty": line["quantity"],
            "unit": money(line["unit_price_cents"], currency),
            "amount": money(line["amount_cents"], currency),
        }
        for line in lines
    ]


def _fit(pdf: FPDF, text: str, width: float) -> str:
    """Cut text to fit a table column, marking the cut with '~'."""

    if pdf.get_string_width(text) <= width:
        return text
    while text and pdf.get_string_width(text + "~") > width:
        text = text[:-1]
    return text + "~"


def _payments_table(pdf: FPDF, payments: list[OfflineInvoicePayment], currency: str) -> None:
    width = _width(pdf)
    columns = [("DATE", 28, "L"), ("RECEIPT", 26, "L"), ("METHOD", 30, "L"), ("REFERENCE", width - 28 - 26 - 30 - 40, "L"),
               ("AMOUNT", 40, "R")]
    pdf.set_font("Courier", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(width, 5, "PAYMENTS", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)
    pdf.set_font("Courier", "B", 7.5)
    for label, w, align in columns:
        pdf.cell(w, 5, label, align=align)
    pdf.ln(5)
    pdf.set_draw_color(*INK)
    pdf.set_line_width(0.4)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(1.5)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*INK)
    for payment in sorted(payments, key=lambda p: (p.paid_on, p.created_at or datetime.min)):
        receipt = payment.receipt
        values = [
            _day(payment.paid_on),
            receipt.number if receipt else "-",
            METHOD_LABELS.get(payment.method, payment.method),
            payment.reference or "-",
            money(payment.amount_cents, currency),
        ]
        for (_, w, align), value in zip(columns, values):
            pdf.cell(w, 6, _fit(pdf, _t(value), w - 2), align=align)
        pdf.ln(6)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.3)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(8)


def render_offline_invoice_pdf(invoice: OfflineInvoice, payments: list[OfflineInvoicePayment]) -> bytes:
    """An invoice for someone without an account: lines with quantities, part payments, a promised date."""

    currency = invoice.currency
    cancelled = invoice.status == "cancelled"
    left = 0 if cancelled else invoice.amount_cents - invoice.paid_cents
    live = [p for p in payments if p.voided_at is None]

    pdf = _new_pdf(f"Invoice {invoice.number}")
    _header(pdf, "INVOICE", invoice.number)
    _parties(pdf, "BILL TO", _bill_to_lines(invoice))
    facts = [
        ("INVOICE NO.", invoice.number),
        ("ISSUED", _day(invoice.created_at)),
        ("DUE", _day(invoice.due_date) if invoice.due_date else "On receipt"),
    ]
    if left and invoice.balance_promised_on:
        facts.append(("PROMISED", _day(invoice.balance_promised_on)))
    _facts(pdf, facts)
    _items(pdf, _line_rows(invoice.lines, currency), with_qty=True)

    sums = [("Total", money(invoice.amount_cents, currency))]
    if invoice.paid_cents > 0:
        balance_label = "Balance due"
        if invoice.balance_promised_on and left:
            balance_label = f"Balance due, promised by {_day(invoice.balance_promised_on)}"
        sums += [("Paid to date", money(invoice.paid_cents, currency)), (balance_label, money(left, currency))]
    _sums(pdf, sums)

    if invoice.status == "part_paid":
        box_y = _total_box(pdf, "BALANCE DUE", money(left, currency))
        _stamp(pdf, "PART PAID", COBALT, box_y)
    elif invoice.status == "paid":
        box_y = _total_box(pdf, "TOTAL PAID", money(invoice.amount_cents, currency))
        _stamp(pdf, f"PAID {_day(invoice.paid_at).upper()}" if invoice.paid_at else "PAID", COBALT, box_y)
    elif cancelled:
        box_y = _total_box(pdf, "TOTAL", money(invoice.amount_cents, currency))
        _stamp(pdf, "CANCELLED", DANGER, box_y)
    else:
        box_y = _total_box(pdf, "TOTAL DUE", money(invoice.amount_cents, currency))
    _after_box(pdf, box_y)

    if live:
        _payments_table(pdf, live, currency)
    details = _lines(settings.INVOICE_PAYMENT_DETAILS)
    if left and details:
        _how_to_pay(pdf, invoice.number, None, details)
    if invoice.notes:
        _labelled(pdf, "NOTES", invoice.notes.replace("\r\n", "\n").split("\n"))
    _thanks(pdf, OFFLINE_THANKS)
    return bytes(pdf.output())


def render_receipt_pdf(receipt: OfflineReceipt) -> bytes:
    """A receipt for one payment against an invoice, or for money taken with no invoice."""

    currency = receipt.currency
    invoice = receipt.invoice
    pdf = _new_pdf(f"Receipt {receipt.number}")
    _header(pdf, "RECEIPT", receipt.number)
    _parties(pdf, "RECEIVED FROM", _bill_to_lines(receipt))
    _facts(pdf, [
        ("RECEIPT NO.", receipt.number),
        ("RECEIVED", _day(receipt.received_on)),
        ("METHOD", METHOD_LABELS.get(receipt.method, receipt.method)),
        ("FOR", invoice.number if invoice else "Direct payment"),
    ])

    amount = money(receipt.amount_cents, currency)
    if receipt.kind == "payment":
        title = f"Payment towards {invoice.number}: {invoice.title}" if invoice else "Payment towards an invoice"
        _items(pdf, [{"title": title, "amount": amount}], with_qty=False)
        _sums(pdf, [
            ("Amount received", amount),
            ("Invoice total", money(receipt.invoice_total_cents or 0, currency)),
            ("Paid to date", money(receipt.paid_to_date_cents or 0, currency)),
            ("Balance due", money(receipt.balance_after_cents or 0, currency)),
        ])
    else:
        _items(pdf, _line_rows(receipt.lines or [], currency), with_qty=True)
        _sums(pdf, [("Amount received", amount)])

    box_y = _total_box(pdf, "AMOUNT RECEIVED", amount)
    if receipt.voided_at is not None:
        _stamp(pdf, f"VOID {_day(receipt.voided_at).upper()}", DANGER, box_y)
    _after_box(pdf, box_y)

    details = []
    if receipt.reference:
        details.append(f"Reference: {receipt.reference}")
    if receipt.note:
        details.append(f"Note: {receipt.note}")
    if details:
        _labelled(pdf, "DETAILS", details)
    _thanks(pdf, OFFLINE_THANKS)
    return bytes(pdf.output())


def offline_pdf_filename(number: str) -> str:
    return f"KleeLab-{number}.pdf"
