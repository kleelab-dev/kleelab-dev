"""Invoice PDFs, in the KleeLab "blueprint" look: ink lines, a cobalt pen, hard shadows.

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
from kleelab.models.project import Project, ProjectInvoice

INK = (14, 21, 48)
COBALT = (35, 64, 232)
MUTED = (91, 99, 128)
LINE = (217, 221, 234)
PAPER = (244, 246, 252)
DANGER = (200, 40, 40)

_PLAIN = {
    "\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
    "\u2022": "*", "\u2026": "...", "\u00a0": " ", "\u20a6": "NGN ", "\u2192": "->",
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


def render_invoice_pdf(invoice: ProjectInvoice, project: Project) -> bytes:
    client = project.client
    pdf = _InvoicePDF(format="A4", unit="mm")
    pdf.set_margins(18, 18, 18)
    pdf.set_auto_page_break(True, margin=24)
    pdf.set_title(_t(f"Invoice {invoice.number}"))
    pdf.set_author("KleeLab")
    pdf.set_creator("KleeLab")
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin

    # Wordmark, and the invoice number on the right.
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(*INK)
    pdf.cell(pdf.get_string_width("Klee"), 11, "Klee")
    pdf.set_text_color(*COBALT)
    pdf.cell(pdf.get_string_width("Lab"), 11, "Lab")
    pdf.set_xy(pdf.l_margin, 18)
    pdf.set_font("Courier", "B", 9)
    pdf.set_text_color(*COBALT)
    pdf.cell(width, 4, "INVOICE", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*INK)
    pdf.cell(width, 8, _t(invoice.number), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(4)
    pdf.set_draw_color(*INK)
    pdf.set_line_width(0.6)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(8)

    # From / Bill to.
    half = width / 2
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
    bill_lines = [
        (client.full_name if client else None) or (client.email if client else "Client"),
        *([client.email] if client and client.full_name else []),
    ]
    bottom = max(block(pdf.l_margin, "FROM", from_lines), block(pdf.l_margin + half, "BILL TO", bill_lines))
    pdf.set_y(bottom + 8)

    # Key facts in a soft band.
    facts = [
        ("INVOICE NO.", invoice.number),
        ("ISSUED", _day(invoice.created_at)),
        ("DUE", _day(invoice.due_date) if invoice.due_date else "On receipt"),
        ("PROJECT", project.reference),
    ]
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

    # The line item.
    amount_w = 48
    pdf.set_font("Courier", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(width - amount_w, 6, "DESCRIPTION")
    pdf.cell(amount_w, 6, "AMOUNT", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_draw_color(*INK)
    pdf.set_line_width(0.4)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(3)
    row_y = pdf.get_y()
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*INK)
    pdf.multi_cell(width - amount_w - 4, 6, _t(invoice.title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(width - amount_w - 4, 5, _t(f"{project.title} ({project.reference})"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    after = pdf.get_y()
    pdf.set_xy(pdf.l_margin + width - amount_w, row_y)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*INK)
    pdf.cell(amount_w, 6, money(invoice.amount_cents, invoice.currency), align="R")
    pdf.set_y(after + 3)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.3)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(8)

    # Total, in a box with the house hard shadow.
    box_w, box_h = 82, 22
    box_x = pdf.w - pdf.r_margin - box_w - 2
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
    label = "TOTAL PAID" if invoice.status == "paid" else "TOTAL DUE" if invoice.status == "unpaid" else "TOTAL"
    pdf.cell(box_w - 10, 4, label)
    pdf.set_xy(box_x + 5, box_y + 9)
    pdf.set_font("Helvetica", "B", 17)
    pdf.set_text_color(*INK)
    pdf.cell(box_w - 10, 9, money(invoice.amount_cents, invoice.currency), align="R")

    # A stamp for anything that is no longer waiting to be paid.
    if invoice.status in ("paid", "cancelled"):
        colour = COBALT if invoice.status == "paid" else DANGER
        text = f"PAID {_day(invoice.paid_at).upper()}" if invoice.status == "paid" and invoice.paid_at else invoice.status.upper()
        pdf.set_font("Courier", "B", 13)
        stamp_w = pdf.get_string_width(text) + 10
        sx, sy = pdf.l_margin + 6, box_y + 4
        with pdf.rotation(8, sx + stamp_w / 2, sy + 6):
            pdf.set_draw_color(*colour)
            pdf.set_line_width(0.9)
            pdf.rect(sx, sy, stamp_w, 12)
            pdf.set_xy(sx, sy + 2.5)
            pdf.set_text_color(*colour)
            pdf.cell(stamp_w, 7, text, align="C")

    pdf.set_y(box_y + box_h + 14)

    # How to pay, only while there is something to pay.
    details = _lines(settings.INVOICE_PAYMENT_DETAILS)
    if invoice.status == "unpaid" and (invoice.pay_url or details):
        pdf.set_font("Courier", "B", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(width, 5, "HOW TO PAY", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(1)
        if invoice.pay_url:
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*INK)
            pdf.cell(pdf.get_string_width("Pay online: ") + 1, 6, "Pay online: ")
            pdf.set_text_color(*COBALT)
            pdf.set_font("Helvetica", "U", 10)
            pdf.multi_cell(0, 6, _t(invoice.pay_url), link=invoice.pay_url, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if details:
            if invoice.pay_url:
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
        pdf.multi_cell(width, 5, _t(f"Please use {invoice.number} as the payment reference."), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(6)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*INK)
    pdf.cell(width, 6, "Thank you for building with KleeLab.", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    return bytes(pdf.output())


def pdf_filename(invoice: ProjectInvoice) -> str:
    return f"KleeLab-{invoice.number}.pdf"
