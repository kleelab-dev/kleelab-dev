# Offline invoices, part payments and receipts

- **Status:** Draft
- **Date:** 2026-11-18
- **Apps:** backend / admin
- **Size:** L overall, so it is split into four parts. Each part is M or smaller and ships on its own, in order:
  - **Part 1. Data, numbering and API:** M, backend only. Safe to ship with no screens.
  - **Part 2. PDFs and email attachments:** S to M, backend only. Needs Part 1.
  - **Part 3. Reporting:** S to M. Covers the Money list, the totals, Today and the CSV, in the backend and the admin. Needs Part 1.
  - **Part 4. Admin screens:** M, admin only. Needs Parts 1 and 2.

## Open questions (owner)
Every question has a default. Building can start on the defaults, but please confirm them before Part 1 is approved.

1. **How long we keep offline records, and the privacy page.** In this spec, offline contacts, invoices, payments and receipts are never deleted by `services/retention.py`. The privacy copy in `kleelab-frontend/src/content/legal.ts` (line 98) only covers people with an account. Should offline records be deleted `INVOICE_RETENTION_YEARS` after a contact's last document? That would be a later spec. Should the privacy page also mention people without an account? **Default:** keep the records and leave the copy as it is in this spec.
2. **Do standalone receipts count as money in?** Should "Paid this month", "Paid in <year>" and Today's paid figure include standalone receipts (money taken without an invoice)? **Default:** yes. It is money received.
3. **Contact email.** Is a contact's email optional? Decision 1 had a question mark next to it. **Default:** optional. With no email, the "Email to client" button is disabled and explains why.
4. **Whole-number quantities.** Are line quantities whole numbers from 1 to 10,000, so that every total is exact in minor units? **Default:** yes. For something like 1.5 hours, use quantity 1 and put "1.5 hours" in the description.
5. **Today's attention list.** Should missed promises and overdue offline balances also appear on Today's attention list (`GET /api/admin/overview`)? **Default:** no. They are flagged on the Money page, in the Today money figures and on the invoice page. The attention list stays about projects.

## Why
Staff sometimes do work for someone who never used KleeLab. That person has no account and no project. Today staff cannot invoice them, record part payments or give them a receipt, and the money does not show up in the Money totals.

## What changes
- On the Money page, staff can press **New invoice** and pick a saved contact or add a new one. The invoice can have several lines, its own currency (NGN by default) and an optional due date. Staff can download it as a PDF or email it.
- Staff record each payment as it comes in: bank transfer, cash or other, with an optional reference and the payment date. Each payment gets its own receipt (RCT-0001 and so on). The receipt shows the amount received, the total paid so far and the balance still due.
- An invoice shows as **Not paid**, **Part paid**, **Paid** or **Cancelled**. If the customer has promised a date for paying the balance, staff save it. A promise that has passed is flagged.
- If a payment was entered by mistake, staff void it and give a reason. The invoice goes back to the right status and the receipt is marked VOID.
- Staff can record a receipt with no invoice, for money taken directly.
- Offline invoices appear in the Money list with an **Offline** tag and a filter. They also count in the totals, on Today and in the CSV, which gains Amount paid and Balance columns.

## Out of scope
- Tax and VAT, discounts, credit notes and refunds.
- Paying offline invoices online (Paystack), pay links, and automatic reminder emails.
- Any client login, dashboard view or `User` row for an offline contact. Nothing in `kleelab-frontend` changes.
- Part payments on project invoices. `ProjectInvoice` and its status rules stay exactly as they are.
- Turning an offline contact into a client account or a project.
- Offline records in Ctrl+K search (`routers/team.py` search), on the Clients pages, or in the GDPR export and delete.
- Deleting offline records on a schedule (see open question 1).
- Editing or re-numbering a receipt after it is issued. A wrong receipt is voided and a new one is issued.

## Design

### Shared rules (all parts)
- **Money** is a whole number of minor units (`*_cents`), the same as `ProjectInvoice.amount_cents`. The server works out each line amount (`quantity * unit_price_cents`) and the total (the sum of the lines). Any amount the client sends for these is ignored. There is no float arithmetic anywhere.
- **Currency** uses the existing `Currency` literal in `schemas/project.py`. The default is `"NGN"`. A payment always takes its invoice's currency, so the request has no currency field.
- **Staff only.** Every route is on a router with `dependencies=[Depends(require_staff)]` (imported from `routers/admin.py`, the same pattern as `routers/care.py`). Anyone else gets a 404. The global rate limiter applies and no extra bucket is needed.
- **Activity log.** Each write calls `services.activity.record(...)` with `project_id=None` and saves in the same commit. Actions are listed below. Invoice and payment actions start with `invoice.`, so `ActivityView.tsx` already gives them the "invoice" colour. All action names are 40 characters or fewer.

| Action | When | subject_type |
|---|---|---|
| `contact.create`, `contact.update`, `contact.archive` | contact saved, edited, archived or restored | `offline_contact` |
| `invoice.offline_create`, `invoice.offline_update` | offline invoice raised or edited | `offline_invoice` |
| `invoice.offline_cancel`, `invoice.offline_reopen` | cancelled or reopened | `offline_invoice` |
| `invoice.offline_promise` | promised date set, changed or cleared | `offline_invoice` |
| `invoice.offline_payment` | payment recorded ("Recorded NGN 50,000.00 by bank transfer on INV-0042, receipt RCT-0007") | `offline_invoice` |
| `invoice.offline_payment_void` | payment voided, with the reason quoted | `offline_invoice` |
| `invoice.offline_email` | invoice PDF emailed (records the address it went to) | `offline_invoice` |
| `receipt.create`, `receipt.void`, `receipt.email` | standalone receipt issued or voided, or any receipt emailed | `offline_receipt` |

### Part 1. Backend: data, numbering, API

#### Why new tables and not `project_invoices`
`services/retention.py` deletes every `ProjectInvoice` that has `project_id IS NULL` once it is older than `INVOICE_RETENTION_YEARS`. If an offline invoice lived in `project_invoices`, the retention job would treat it as a detached invoice and delete it. `ProjectInvoice` also has no lines, contact, partial payments or promised date. Separate tables keep retention, Paystack (`services/payments.py`), reminders (`services/billing.py`) and the client dashboard away from offline money without adding any new conditions to that code.

**Why the lines are stored as JSONB.** Lines are always read and written together with their invoice or receipt, and they are never queried one at a time. An issued document is a snapshot, and editing replaces the whole list. The stored `amount_cents` column on the parent holds the total for SQL. JSONB means no child table, no orphans and no ordering column. The Pydantic schema validates every line, and a db check confirms that the stored total equals the sum of the lines.

#### Models: new file `src/kleelab/models/offline.py`
Strings are used for status values, as in `models/project.py`. All ids are UUIDs, and all times use `DateTime` with `server_default=func.now()`.

**`OfflineContact`**, table `offline_contacts`
- `id`
- `name String(120) NOT NULL`
- `company String(150) NULL`
- `email String(255) NULL`
- `phone String(40) NULL`
- `address Text NULL`
- `archived_at DateTime NULL`: hides the contact from the picker. Contacts are never deleted.
- `created_by_id` FK `users.id` `ON DELETE SET NULL`
- `created_at`, `updated_at`
- Index on `lower(name)`.

**`OfflineInvoice`**, table `offline_invoices`
- `id`
- `number String(20) UNIQUE NOT NULL`, in the shared `INV-` sequence
- `contact_id` FK `offline_contacts.id` `ON DELETE RESTRICT NOT NULL`, indexed
- `bill_to_name String(120) NOT NULL`, `bill_to_company`, `bill_to_email`, `bill_to_phone`, `bill_to_address`: copied from the contact when the invoice is created, and copied again when `contact_id` changes while the invoice can still be edited. Editing the contact later never changes a document that was already issued.
- `title String(150) NOT NULL`
- `lines JSONB NOT NULL`: a list of `{description, quantity, unit_price_cents, amount_cents}`
- `amount_cents Integer NOT NULL`: the total
- `currency String(3) NOT NULL DEFAULT 'NGN'`
- `paid_cents Integer NOT NULL DEFAULT 0`: the sum of the payments that are not voided. It is only ever set by `recalculate()` (below).
- `due_date Date NULL`
- `balance_promised_on Date NULL`
- `status String(20) NOT NULL DEFAULT 'unpaid'`: one of `unpaid | part_paid | paid | cancelled`
- `paid_at DateTime NULL`: midnight of the latest payment's `paid_on` once the invoice is fully paid. It keeps the same meaning as `ProjectInvoice.paid_at` for lists.
- `notes Text NULL`: printed on the PDF
- `cancelled_at DateTime NULL`
- `created_by_id` FK users `SET NULL`
- `created_at`, `updated_at`
- Check constraints:
  - `amount_cents > 0`
  - `paid_cents >= 0 AND paid_cents <= amount_cents`
  - `status IN (...)`
  - `status <> 'cancelled' OR paid_cents = 0`
- Indexes on `status` and `created_at`.

**`OfflineInvoicePayment`**, table `offline_invoice_payments`
- `id`
- `invoice_id` FK `offline_invoices.id` `ON DELETE RESTRICT NOT NULL`, indexed
- `amount_cents Integer NOT NULL CHECK > 0`
- `method String(20) NOT NULL CHECK IN ('bank_transfer','cash','other')`
- `reference String(100) NULL`
- `paid_on Date NOT NULL`
- `note String(500) NULL`
- `recorded_by_id` FK users `SET NULL`
- `voided_at DateTime NULL`, `voided_by_id` FK users `SET NULL`, `void_reason String(300) NULL`
- `created_at`
- Payments are voided, never deleted. Their receipt number has already been given to the customer.

**`OfflineReceipt`**, table `offline_receipts`
- `id`
- `number String(20) UNIQUE NOT NULL`, from the `RCT-` sequence
- `kind String(20) NOT NULL CHECK IN ('payment','standalone')`
- `payment_id` FK `offline_invoice_payments.id` `UNIQUE NULL` `ON DELETE RESTRICT`
- `invoice_id` FK `offline_invoices.id` `NULL` `ON DELETE RESTRICT`
- Check: `(kind = 'payment') = (payment_id IS NOT NULL AND invoice_id IS NOT NULL)`
- `contact_id` FK `RESTRICT NOT NULL`, and `bill_to_*` columns copied as on the invoice
- `currency String(3) NOT NULL`
- `amount_cents Integer NOT NULL CHECK > 0`
- `lines JSONB NULL`: standalone receipts only
- `method`, `reference`, `received_on Date NOT NULL`, `note String(500) NULL`
- Payment receipts only, as figures at the time the receipt was issued: `invoice_total_cents`, `paid_to_date_cents` (this payment included) and `balance_after_cents`, all `Integer NULL`. A re-download prints the same figures as the original.
- `voided_at`, `voided_by_id`, `void_reason`
- `created_by_id`, `created_at`
- Indexes on `received_on` and `contact_id`.

**`DocumentCounter`**, table `document_counters`
- `name String(10) PRIMARY KEY`: `'INV'` or `'RCT'`
- `last_value Integer NOT NULL`

#### Numbering: new file `src/kleelab/services/numbering.py`
```python
async def next_number(db: AsyncSession, name: Literal["INV", "RCT"]) -> str
```
1. Run `UPDATE document_counters SET last_value = last_value + 1 WHERE name = :name RETURNING last_value`. The row stays locked until the caller commits. Two staff, or a staff member and the care billing loop, then queue up and cannot get the same number. A rollback gives the number back, so numbers stay gapless.
2. Guard: while `f"{name}-{n:04d}"` already exists in `project_invoices.number` or `offline_invoices.number` (for INV), or in `offline_receipts.number` (for RCT), add one and update the row. This protects against rows inserted by hand or by scripts.

`services/projects.py` `next_invoice_number(db)` keeps its signature and becomes `return await numbering.next_number(db, "INV")`. Its four callers (`routers/admin.py:787`, `routers/proposals.py:399`, `services/billing.py:44`, `services/care.py:85`) do not change. The builder must confirm that none of them makes a network call between getting a number and committing. The lock is held for that whole time.

#### Migration: `migrations/versions/add_offline_money.py`
- `revision = "add_offline_money"`, `down_revision = "add_call_phone"` (the current head).
- `upgrade()`:
  1. Create the five tables, their constraints and their indexes.
  2. Seed the `INV` counter with `GREATEST(COUNT(*), MAX(suffix))` over `project_invoices`, where `suffix` is the number part of rows matching `^INV-[0-9]+$`, or 0 if there are none. Numbers that do not match the pattern, such as the db checks' `A1b2c3`, are ignored. The next number is therefore higher than any number issued so far.
  3. Seed `RCT` with 0.
  4. No existing row is changed.
- `downgrade()`:
  1. If `offline_invoices` or `offline_receipts` has any rows, raise `RuntimeError("Offline invoices or receipts exist; export them first. Refusing to drop financial records.")`.
  2. Otherwise drop the tables in reverse order.
- The empty test database must go up, down and up again cleanly.

#### Service: new file `src/kleelab/services/offline.py`
- `line_amounts(lines) -> (lines_with_amounts, total)`: pure integer arithmetic. It raises `ValueError` if a line or the total is over `MAX_CENTS = 2_000_000_000`.
- `recalculate(invoice, payments)`:
  - `paid_cents` = the sum of the payments that are not voided.
  - Status: `cancelled` stays `cancelled`. Otherwise it is `unpaid` when nothing is paid, `part_paid` when `0 < paid < total`, and `paid` when `paid == total`.
  - `paid_at` = midnight of the latest `paid_on` when the status is `paid`, otherwise `None`.
  - When the status becomes `paid`, `balance_promised_on` is cleared.
  - This is the only place that changes `paid_cents`, `status` (other than cancel and reopen) or `paid_at`.
- `lock_invoice(db, id)`: `SELECT ... FOR UPDATE`. Every write to an invoice, its payments or its receipts takes this lock first. Two payments recorded at the same moment therefore cannot add up to more than the total.
- `is_editable(invoice)`: true when `status == "unpaid"` and `paid_cents == 0`.
- `balance(invoice)`: `amount_cents - paid_cents`, or 0 when the invoice is cancelled.
- `effective_due(invoice)`: `balance_promised_on` if it is set, otherwise `due_date`. It is overdue when the balance is above 0 and `effective_due < today`.

#### State rules
| From | Action | Allowed when | Result |
|---|---|---|---|
| any | edit `title`, `lines`, `currency`, `contact_id` | `is_editable` | saved, total worked out again, `bill_to_*` copied again if the contact changed |
| unpaid, part_paid | edit `due_date`, `notes` | balance > 0 | saved |
| unpaid, part_paid | set or clear `balance_promised_on` | balance > 0 | saved, `invoice.offline_promise` logged |
| paid | any edit | never | 409 "A paid invoice cannot be changed. Void a payment first." |
| cancelled | any edit or payment | never | 409 "Reopen the invoice first." |
| unpaid, part_paid | record a payment | `1 <= amount <= balance` | payment and receipt created, `recalculate` |
| any not cancelled | void a payment | the payment is not voided yet | payment and receipt voided, `recalculate` (paid can go back to part_paid or unpaid) |
| unpaid (paid_cents = 0) | cancel | | `cancelled`, `cancelled_at` set, promise cleared |
| part_paid, paid | cancel | never | 409 "Void the payments before cancelling." |
| cancelled | reopen | | `unpaid`, `cancelled_at` cleared |
| standalone receipt | void | not voided yet | voided. A standalone receipt cannot be edited. |

#### Schemas: new file `src/kleelab/schemas/offline.py`
These are the limits Pydantic enforces. A breach returns 422.
- `ContactIn`:
  - `name` 2–120
  - `company` up to 150
  - `email: EmailStr | None`
  - `phone` up to 40, pattern `^[0-9+()\-\s.]*$`
  - `address` up to 500
  - Values are trimmed, and empty strings are saved as null.
- `ContactPatch`: the same fields, all optional, plus `archived: bool | None`.
- `ContactOut`: `id`, the fields above, `archived_at`, `created_at`, `invoice_count`, `receipt_count`.
- `ContactDetail(ContactOut)`: `invoices: list[OfflineInvoiceSummary]`, `receipts: list[ReceiptOut]`.
- `LineIn`:
  - `description` 1–300
  - `quantity: int` 1–10,000
  - `unit_price_cents: int` 0–2,000,000,000
- `LineOut(LineIn)`: adds `amount_cents`.
- `OfflineInvoiceCreate`:
  - Exactly one of `contact_id: UUID` or `contact: ContactIn`. The second one creates the contact in the same commit.
  - `title` 2–150
  - `lines: list[LineIn]`, 1–50 items
  - `currency: Currency = "NGN"`
  - `due_date: date | None`
  - `notes` up to 1,000
  - The total must be from 1 to 2,000,000,000, otherwise 422 "The total must be more than zero and at most 20,000,000.00".
- `OfflineInvoicePatch`: every field optional, plus `balance_promised_on: date | None`. Sending `null` clears a date and leaving it out keeps it, the same as `LeadPatch`.
- `PaymentIn`:
  - `amount_cents: int >= 1`
  - `method: Literal["bank_transfer","cash","other"]`
  - `reference` up to 100
  - `paid_on: date`, no later than today and no earlier than 2000-01-01
  - `note` up to 500
- `VoidIn`: `reason` 3–300, required.
- `PaymentOut`: `id`, `amount_cents`, `method`, `reference`, `paid_on`, `note`, `recorded_by_name`, `created_at`, `voided_at`, `void_reason`, `receipt_id`, `receipt_number`.
- `OfflineInvoiceSummary`: `id`, `number`, `title`, `amount_cents`, `paid_cents`, `balance_cents`, `currency`, `status`, `due_date`, `balance_promised_on`, `created_at`.
- `OfflineInvoiceDetail(OfflineInvoiceSummary)`: `contact: ContactOut`, the `bill_to_*` fields, `lines: list[LineOut]`, `notes`, `paid_at`, `cancelled_at`, `payments: list[PaymentOut]` (voided ones included, newest first), `editable: bool`, `overdue: bool`.
- `StandaloneReceiptIn`:
  - Exactly one of `contact_id` or `contact`
  - `currency = "NGN"`
  - `lines: list[LineIn]`, 1–50 items. The admin's "amount only" mode sends one line with quantity 1.
  - `method`, `reference`, `received_on` (the same rules as `paid_on`), `note`
  - The total is from 1 to 2,000,000,000.
- `ReceiptOut`:
  - `id`, `number`, `kind`, `contact_id`, `bill_to_name`, `currency`, `amount_cents`, `method`, `reference`, `received_on`, `note`, `voided_at`, `void_reason`, `created_at`
  - `invoice_id`, `invoice_number`
  - `invoice_total_cents`, `paid_to_date_cents`, `balance_after_cents`
  - `lines: list[LineOut] | None`
- `EmailIn`: `to: EmailStr | None` (defaults to the contact's current email), `message` up to 2,000.

#### Endpoints: new file `src/kleelab/routers/offline.py`
Prefix `/api/admin/offline`, mounted in `main.py`. Staff only. Unknown ids return 404.

| Method and path | Request | Response | Errors |
|---|---|---|---|
| `GET /contacts?q=&archived=false` | `q` up to 100. Case-insensitive search on name, company and email. Ordered by name, at most 200. | `list[ContactOut]` | |
| `POST /contacts` | `ContactIn` | 201 `ContactOut` | 422 |
| `GET /contacts/{id}` | | `ContactDetail` | 404 |
| `PATCH /contacts/{id}` | `ContactPatch` | `ContactOut` | 422 |
| `POST /invoices` | `OfflineInvoiceCreate` | 201 `OfflineInvoiceDetail` | 404 for an unknown or archived `contact_id`, 422 |
| `GET /invoices/{id}` | | `OfflineInvoiceDetail` | 404 |
| `PATCH /invoices/{id}` | `OfflineInvoicePatch` | `OfflineInvoiceDetail` | 409 under the state rules, 422 |
| `POST /invoices/{id}/cancel` | `{}` | `OfflineInvoiceDetail` | 409 |
| `POST /invoices/{id}/reopen` | `{}` | `OfflineInvoiceDetail` | 409 if the invoice is not cancelled |
| `POST /invoices/{id}/payments` | `PaymentIn` | 201 `OfflineInvoiceDetail` | 409 if the invoice is cancelled or paid. 422 "That is more than the balance of NGN 25,000.00" when `amount > balance`. |
| `POST /invoices/{id}/payments/{pid}/void` | `VoidIn` | `OfflineInvoiceDetail` | 409 if already voided |
| `GET /invoices/{id}/pdf` | | `application/pdf`, with the same headers as `routers/projects.py:download_invoice` | 404 |
| `POST /invoices/{id}/email` | `EmailIn` | `{"sent": true, "to": "…"}` | 409 if cancelled. 409 "Add an email for this contact first" when there is no `to` and no contact email. 502 if the provider rejects it. |
| `GET /receipts?kind=payment\|standalone&voided=` | | `list[ReceiptOut]`, newest `received_on` first | |
| `POST /receipts` | `StandaloneReceiptIn` | 201 `ReceiptOut` | 404, 422 |
| `GET /receipts/{id}` | | `ReceiptOut` | 404 |
| `POST /receipts/{id}/void` | `VoidIn` | `ReceiptOut` | 409 if already voided. On a payment receipt it voids the payment as well, with the same effect as the payment void route. |
| `GET /receipts/{id}/pdf` | | `application/pdf` | 404 |
| `POST /receipts/{id}/email` | `EmailIn` | `{"sent": true, "to": "…"}` | 409 if voided or there is no address, 502 |

Recording a payment, all in one transaction after `lock_invoice`:
1. Insert the payment.
2. Get an `RCT` number.
3. Insert a `payment` receipt with `paid_to_date_cents` and `balance_after_cents`.
4. Run `recalculate`.
5. Log activity.
6. Commit.

### Part 2. Backend: PDFs and email

#### `src/kleelab/services/invoice_pdf.py` refactor
Split `render_invoice_pdf` into private helpers in the same file:
- `_new_pdf(title)`
- `_header(pdf, word, number)`: word is "INVOICE" or "RECEIPT"
- `_parties(pdf, right_label, right_lines)`: the FROM block stays as it is
- `_facts(pdf, facts)`: works with three or four columns
- `_items(pdf, rows, with_qty)`
- `_total_box(pdf, label, amount)`
- `_stamp(pdf, text, colour, y)`
- `_how_to_pay(pdf, number, pay_url, details)`
- `_thanks(pdf, text)`

`render_invoice_pdf(invoice, project)` keeps its signature and output. With `with_qty=False` it draws the same two columns (DESCRIPTION / AMOUNT) and the same text in the same places. `pdf_filename` is unchanged.

New functions:
- `render_offline_invoice_pdf(invoice: OfflineInvoice, payments: list[OfflineInvoicePayment]) -> bytes`:
  - Header "INVOICE" and the number. "BILL TO" shows the `bill_to_*` lines: name, company, address lines, email, phone.
  - Facts band: INVOICE NO., ISSUED, DUE ("On receipt" when there is no date), and PROMISED only when there is a balance and `balance_promised_on` is set.
  - Items table with DESCRIPTION, QTY, UNIT PRICE and AMOUNT columns. Pages break automatically, which is fine for up to 50 lines.
  - Under the table, right-aligned: "Total", plus "Paid to date" and "Balance due" when `paid_cents > 0`. When a promise is set, "Balance due" reads "Balance due, promised by 12 Dec 2026".
  - Box label: TOTAL DUE when unpaid, BALANCE DUE when part paid (the box shows the balance), TOTAL PAID when paid, TOTAL when cancelled.
  - Stamp: `PAID <date>` in cobalt, `PART PAID` in cobalt, `CANCELLED` in danger.
  - "PAYMENTS" history table when any payment is not voided: DATE, RECEIPT, METHOD (Bank transfer / Cash / Other), REFERENCE, AMOUNT. Voided payments are left out.
  - "HOW TO PAY" from `INVOICE_PAYMENT_DETAILS` while there is a balance and the invoice is not cancelled. There is no pay link. The reference line is unchanged.
  - Notes, if any. Then the thanks line "Thank you for working with KleeLab."
- `render_receipt_pdf(receipt: OfflineReceipt) -> bytes`:
  - Header "RECEIPT" and the number. Right-hand party block labelled "RECEIVED FROM".
  - Facts: RECEIPT NO., RECEIVED (date), METHOD, FOR (the invoice number, or "Direct payment").
  - A payment receipt has one row, "Payment towards INV-0042: <title>", followed by "Invoice total", "Paid to date" and "Balance due" from the figures saved on the receipt.
  - A standalone receipt has the items table with QTY columns.
  - Box "AMOUNT RECEIVED". Reference and note lines when they are set.
  - `VOID <date>` stamp in danger red when voided. The thanks line.
- `offline_pdf_filename(number) -> "KleeLab-<number>.pdf"`.

All text goes through `_t`, so a name like "Ọlá Adé – “Shop”" downloads without errors.

#### Email attachments: `src/kleelab/services/email.py`
Neither `_send` nor `_send_mailtrap` supports attachments today.
- Add `attachments: list[tuple[str, bytes, str]] | None = None` (filename, content, MIME type) to `_send` and `_send_mailtrap`.
- Mailtrap Send API: `message["attachments"] = [{"content": base64.b64encode(data).decode(), "filename": name, "type": mime, "disposition": "attachment"}]`.
- Resend: `message["attachments"] = [{"filename": name, "content": base64.b64encode(data).decode()}]`. The builder checks the installed `resend` version accepts base64 content and adjusts if it does not.
- In the development fallback, log "with N attachment(s)" and never the bytes.
- Refuse attachments over 5 MB in total: log and return `False`.
- Add `send_offline_invoice_email(to, name, number, total, balance, due, message, pdf) -> bool`:
  - Label "invoice <number>". Heading `<balance or total> due` (or "Invoice <number>" when paid).
  - The staff message is escaped and its paragraphs kept, as in `send_lead_reply`.
  - No button, because there is no dashboard.
  - Footer: "You are getting this because you did business with KleeLab."
  - `reply_to = REPLY_TO_EMAIL or TEAM_INBOX`.
- Add `send_offline_receipt_email(...)` in the same way. Heading "Thank you: we received <amount>".
- The routes send in the request, as `remind_invoice` does. When sending fails they return 502 and log nothing to the activity log.

### Part 3. Reporting

#### Backend, `routers/admin.py` and `schemas/project.py`
- `AdminInvoiceOut` gains `source: Literal["project"] = "project"`, `paid_cents: int`, `balance_cents: int` and `balance_promised_on: date | None = None`. For project invoices, `paid_cents` is `amount` when paid and 0 otherwise. `balance_cents` is `amount` when unpaid and 0 otherwise. Existing fields and values do not change, so `ClientDetail.invoices` keeps working.
- New `OfflineMoneyInvoiceOut` in `schemas/project.py`, next to `AdminInvoiceOut`, so Parts 1 and 3 do not edit the same file:
  - `source: Literal["offline"]`, `id`, `number`, `title`, `amount_cents`, `paid_cents`, `balance_cents`, `currency`
  - `status` (including `part_paid`), `due_date`, `balance_promised_on`, `paid_at`, `created_at`
  - `contact_id`, `client_name` (`bill_to_name`), `client_email`, `client_company`
  - `payments: list[{amount_cents, paid_on}]`, for payments that are not voided
- `GET /api/admin/invoices` returns `list[Annotated[AdminInvoiceOut | OfflineMoneyInvoiceOut, Field(discriminator="source")]]`. Both kinds are merged and sorted by `created_at`, newest first. Project rows are unchanged.
- `_money_by_currency` is replaced by `_project_totals(*conds)` and `_offline_totals(...)`, and the two are merged per currency with a `_merge(*lists)` helper. In `stats()`:
  - `unpaid`: project invoices that are unpaid (their amount), plus offline invoices that are unpaid or part paid (`amount_cents - paid_cents`). `count` is the number of invoices.
  - `overdue`: the project rule as it is today, plus offline invoices with a balance where `coalesce(balance_promised_on, due_date) < today`.
  - `paid_this_month`: project invoices paid this month (`paid_at`), plus offline payments that are not voided and have `paid_on >= month_start`, plus standalone receipts that are not voided and have `received_on >= month_start` (open question 2). `count` is now the number of payments. For a project invoice, one paid invoice counts as one payment.

#### Admin, `kleelab-admin`
- `src/types/api.ts`:
  - `AdminInvoice` gains `source: 'project'`, `paid_cents`, `balance_cents` and `balance_promised_on?: string | null`.
  - New `OfflineInvoiceStatus = InvoiceStatus | 'part_paid'`.
  - New `OfflineMoneyInvoice`.
  - `type MoneyInvoice = AdminInvoice | OfflineMoneyInvoice`.
  - `InvoiceStatus` itself stays the same, so the client dashboard types and `InvoicePatchInput` do not change.
- `src/services/api.ts`: `adminInvoices(): Promise<MoneyInvoice[]>`.
- `src/components/project/format.ts`:
  - `INVOICE_STATUS` becomes `Record<OfflineInvoiceStatus, …>` and adds `part_paid: { label: 'Part paid', tone: 'bg-cobalt-soft text-cobalt-dark' }`.
  - `isOverdue` takes optional `balance_promised_on` and treats `part_paid` like `unpaid`, using `promise ?? due`. Project invoices behave as before.
  - New `promiseMissed(i)`.
- `src/components/money/MoneyView.tsx`:
  - The list state becomes `MoneyInvoice[]`.
  - Filters: Not paid (balance above 0 and not cancelled), **Part paid**, Overdue, Paid, Cancelled, All. A second group: All / Projects / **Offline**, kept in the URL as `?source=` next to `?show=`.
  - The search also matches `client_company`.
  - "Waiting to be paid" adds up `balance_cents`.
  - Paid this month and paid this year: project rows by `paid_at`, plus offline `payments[].paid_on`, plus standalone receipts. MoneyView fetches these through `adminOfflineReceipts({kind:'standalone'})`, and a failure there shows the usual `ErrorState`. The note text becomes "N payments".
  - The subtitle becomes "Every invoice, from projects and offline work."
  - Rows are chosen by `source`: `InvoiceRow` for project rows (its behaviour does not change) and the new `OfflineInvoiceRow`.
- CSV (`downloadCsv`): the 12 existing columns keep their order and meaning, so existing spreadsheets still work. Four columns are added at the end: **Source** (`project`/`offline`), **Amount paid**, **Balance** and **Promised by**. Status can now also be `part_paid`; `overdue` is only exported for an unpaid invoice, never a part-paid one. For offline rows, Project and Paystack reference are empty.
- `src/components/money/OfflineInvoiceRow.tsx` (new):
  - The same grid as `InvoiceRow`.
  - An "Offline" pill (`bg-sun-soft`/`border-ink`, existing tokens) next to the number.
  - The client name links to `/money/contacts/{contact_id}` and the title to `/money/offline/{id}`.
  - Amount column: the total. When part paid, a muted line underneath reads "NGN X left".
  - Status pill. A missed promise shows "Promise missed" in danger with the date.
  - Actions: **Record payment** (links to `/money/offline/{id}?pay=1`) when there is a balance, and **PDF**.
- `src/components/today/TodayView.tsx`: the paid-this-month note says "N payments". Nothing else changes, because `AdminStats` keeps its shape.

### Part 4. Admin screens (`kleelab-admin`)
Next.js 16. Check `node_modules/next/dist/docs/` for async `params` and `useSearchParams` under `Suspense`, as in `app/(team)/money/page.tsx`. The nav stays as it is, with "Money" covering everything. A sub-nav sits under the Money heading.

- `src/components/money/MoneyTabs.tsx` (new): links for Invoices `/money`, Receipts `/money/receipts` and Contacts `/money/contacts`, with `aria-current`. It also holds the primary buttons **New invoice** (`/money/offline/new`) and **Record receipt** (`/money/receipts/new`).
- Routes (new). Each page is a thin wrapper around its component, with `metadata.title` set:
  - `src/app/(team)/money/offline/new/page.tsx`: `OfflineInvoiceForm`. Title "New invoice".
  - `src/app/(team)/money/offline/[id]/page.tsx`: `OfflineInvoiceView`. Title "Invoice".
  - `src/app/(team)/money/receipts/page.tsx`: `ReceiptList`. Title "Receipts".
  - `src/app/(team)/money/receipts/new/page.tsx`: `ReceiptForm`. Title "Record a receipt".
  - `src/app/(team)/money/contacts/page.tsx` and `[id]/page.tsx`: `ContactList` and `ContactView`. Titles "Contacts" and "Contact".
- Components (new), all in `src/components/money/offline/`:
  - `ContactPicker.tsx`: a search box with a list of matches (keyboard: arrow keys, Enter, Esc) and a "New contact" option that opens `ContactForm` inline. Archived contacts are hidden.
  - `ContactForm.tsx`: Name (required), Company, Email, Phone, Address (textarea). Uses the `.field` class and labelled inputs.
  - `LineItemsEditor.tsx`:
    - Each row has a description, a quantity and a unit price typed in major units such as "1500.50".
    - Typed prices are converted to cents by parsing the string as a decimal. They are never multiplied as floats: "19.99" becomes 1999 by string parsing.
    - Rows can be added, removed and moved up or down. Up to 50 rows.
    - A live line total and grand total, worked out with integer cents.
  - `OfflineInvoiceForm.tsx`: contact, title, currency select (NGN by default), lines, due date, notes. Used for both create and edit. Editing is offered only when `editable`. Otherwise only the due date, notes and promise are shown.
  - `OfflineInvoiceView.tsx`:
    - A header with the number, status pill, "Offline" tag, and Total, Paid and Balance figures.
    - The promised date, with a date input and a clear control, shown while there is a balance. A missed promise is shown in danger.
    - Bill-to, lines and notes.
    - A payments list: date, receipt number (links to the receipt PDF), method, reference, amount, recorded by, and a **Void** control. Voided payments are struck through with their reason.
    - Actions: Record payment, Edit, PDF, Email to client, Cancel and Reopen. Each one is hidden or disabled according to the state rules.
    - `?pay=1` opens the payment dialog.
  - `RecordPaymentDialog.tsx`: a native `<dialog>` with `showModal`, the same as `CommandPalette.tsx`. Focus is trapped and Esc closes it.
    - Fields: amount (pre-filled with the balance, and the maximum allowed), method radio group (Bank transfer, Cash, Other), reference, paid on (today by default, no future dates) and note.
    - The 422 message from the server is shown as it comes.
    - On success it reads "Recorded. Receipt RCT-0007 is ready." with a PDF link and an "Email receipt" link.
  - `VoidDialog.tsx`: a required reason. Copy: "Voiding keeps the record and marks receipt RCT-0007 VOID. The invoice balance goes back up." Used for both payments and receipts.
  - `EmailDocumentDialog.tsx`: To (the contact's email, editable) and an optional message. Disabled with a title "Add an email for this contact first" when there is no address. Shows "Sent to x@y.com" or the error text.
  - `ReceiptList.tsx`:
    - Filters: All / From invoices / Direct, with "Show voided" off by default.
    - Rows: number, contact, invoice link if any, method, date, amount, and VOID shown as a pill.
    - PDF, Email and Void actions.
  - `ReceiptForm.tsx`: contact, currency, a toggle between "Single amount" (description and amount) and "Line items", plus method, reference, received on and note. After saving it lands on the receipts list with a notice and a PDF link.
  - `ContactList.tsx` / `ContactView.tsx`: search, edit, archive and restore. The contact page shows their invoices (with balances) and receipts, and has New invoice and Record receipt buttons with the contact pre-picked (`?contact=<id>`).
- `src/services/api.ts` gets new methods, all using the existing `request` / `post` / `patch` / `saveDownload`:
  - `adminOfflineContacts(q?, archived?)`, `adminOfflineContact(id)`, `adminCreateOfflineContact`, `adminUpdateOfflineContact`
  - `adminCreateOfflineInvoice`, `adminOfflineInvoice`, `adminUpdateOfflineInvoice`, `adminCancelOfflineInvoice`, `adminReopenOfflineInvoice`
  - `adminRecordOfflinePayment`, `adminVoidOfflinePayment`
  - `downloadOfflineInvoicePdf(invoice)`, `emailOfflineInvoice(id, input)`
  - `adminOfflineReceipts(filter?)`, `adminCreateReceipt`, `adminVoidReceipt`, `downloadReceiptPdf(receipt)`, `emailReceipt(id, input)`
- `src/types/api.ts`: types that mirror every schema in Part 1.
- States on every screen:
  - Loading uses `Skeleton`.
  - Empty uses `EmptyState`, for example "No receipts yet" with the Record receipt button, or "No contacts yet. They are saved when you raise an invoice.".
  - Errors use `ErrorState` with retry, and form errors appear inline next to the field the 422 is about.
  - Success shows the `role="status"` notice in mint, the same as MoneyView.
- These are admin-only screens, so `components/project/*` in `kleelab-frontend` does not change.

### Words and SEO
- These are admin pages, so there is no SEO. Each page has one `<h1>` and a `metadata.title` as listed.
- Method labels: "Bank transfer", "Cash", "Other".
- Status labels: "Not paid" (the filter) or "To pay" (the pill, as it is today), "Part paid", "Paid", "Cancelled", "Promise missed".
- Copy has no location claims.

## Acceptance criteria
Unless a criterion says otherwise, requests are made by a signed-in staff member. "422/409" means the exact status code.

**Access and data**
1. Given a client token or no token, when any `/api/admin/offline/*` route is called, then it returns 404 and writes nothing.
2. Given an empty test database at `add_call_phone`, when `alembic upgrade head`, then `downgrade add_call_phone`, then `upgrade head` are run, then all three succeed. After the first upgrade, `document_counters` holds INV = the highest existing `INV-` number (or the count of project invoices if that is higher) and RCT = 0.
3. Given at least one offline invoice exists, when `alembic downgrade add_call_phone` is run, then it stops with the "Refusing to drop financial records" error and no table is dropped.
4. Given an offline invoice that is 10 years old, when `purge_expired` runs, then the invoice, its payments and its receipts are still there.

**Numbering**
5. Given project invoices up to `INV-0041`, when an offline invoice and then a project invoice are created, then they get `INV-0042` and `INV-0043`. No number is ever used in both `project_invoices` and `offline_invoices`.
6. Given 20 invoice creations run at the same time (mixed project and offline, `asyncio.gather` with separate sessions), when they all commit, then the 20 numbers are distinct and consecutive.
7. Given a row inserted by hand with the next number, when a new invoice is created, then the number guard skips the taken number.
8. Given no receipts exist, when the first payment is recorded, then its receipt is `RCT-0001`. The next payment receipt or standalone receipt is `RCT-0002`.

**Money arithmetic and validation**
9. Given lines (3 × 19,999) + (1 × 1) + (2 × 50,000,000), when the invoice is created, then the line amounts are 59,997, 1 and 100,000,000 and `amount_cents` = 100,059,998. Any `amount_cents` the client sends on a line is ignored.
10. Given lines whose total would be 0, or over 2,000,000,000, or a line with quantity 0, quantity 10,001, a negative price, 51 lines, or no contact (or both `contact_id` and `contact`), when posted, then the response is 422 and nothing is saved.
11. Given the admin line editor, when "19.99", "0.1" and "1500" are typed as unit prices, then the request sends 1999, 10 and 150000. The grand total shown equals the server's `amount_cents`.

**Payments and status**
12. Given an invoice of NGN 100,000.00 with nothing paid, when NGN 40,000.00 is recorded, then the status is `part_paid`, `paid_cents` = 4,000,000, `balance_cents` = 6,000,000, and receipt RCT-n has `paid_to_date_cents` 4,000,000 and `balance_after_cents` 6,000,000.
13. Given that invoice, when a payment of 6,000,001 cents is posted, then the response is 422 with "That is more than the balance of NGN 60,000.00" and no payment or receipt is created.
14. Given that invoice, when exactly 6,000,000 is recorded, then the status is `paid`, `paid_at` is the date of that payment, `balance_promised_on` is null, and further payments return 409.
15. Given two requests that each pay the full remaining balance at the same time, when both run, then exactly one succeeds and the other gets 422. `paid_cents` never exceeds `amount_cents`.
16. Given a paid invoice, when its last payment is voided with a reason, then the payment and its receipt both have `voided_at` and the reason, the status goes back to `part_paid` (or `unpaid`), and `invoice.offline_payment_void` is logged with the reason.
17. Given a void with a reason shorter than 3 characters, or a second void of the same payment, then the response is 422 or 409 respectively.
18. Given a `part_paid` or `paid` invoice, when it is cancelled, then the response is 409 "Void the payments before cancelling.". Given an `unpaid` invoice with no payments, cancel succeeds, and payments and edits then return 409 until it is reopened.
19. Given a `part_paid` invoice, when `lines` or `currency` are patched, then the response is 409. When `due_date`, `notes` or `balance_promised_on` are patched, then the change is saved. Given a `paid` invoice, any patch returns 409.
20. Given a payment with `paid_on` tomorrow, then the response is 422.
21. Given payments of 1, 2 and 3 cents on a 6-cent invoice, then the invoice is `paid`. After any one of them is voided, `paid_cents` equals the sum of the payments that are not voided.

**Promised date**
22. Given an invoice with a balance and `balance_promised_on` set to yesterday, when the Money page loads, then the row shows "Promise missed" and the date. The invoice counts in Overdue on the Money page and in `stats().overdue` for its balance. With the promise set to next week and a due date of yesterday, it is not overdue.
23. Given a paid or cancelled invoice, when `balance_promised_on` is patched, then the response is 409.

**Standalone receipts**
24. Given a standalone receipt with lines (2 × 5,000), when it is posted, then it is saved as `kind: standalone` with `amount_cents` 10,000 and no invoice. Voiding it sets `voided_at` and leaves every invoice unchanged.
25. Given a payment receipt, when `POST /receipts/{id}/void` is called, then the linked payment is also voided and the invoice is recalculated, the same as criterion 16.

**PDFs**
26. Given a fixed fixture project invoice and a fixed `creation_date`, when `render_invoice_pdf` is run before and after the refactor, then the SHA-256 of the two outputs is the same. The backend-engineer pastes both hashes in their report.
27. Given a `part_paid` offline invoice with a promise and two payments (one voided), when its PDF is downloaded, then the text contains the number, each line, "Total", "Paid to date", "Balance due, promised by <date>", "PART PAID" and the receipt number of the payment that is not voided. It does not contain the voided payment's receipt number.
28. Given a payment receipt, when its PDF is downloaded, then it shows RECEIPT, its RCT number, the invoice number, "Amount received", "Paid to date" and "Balance due". After it is voided, it shows "VOID".
29. Given contact and line text with characters outside Latin-1 (for example "Ọlá Adé – “Shop” ₦"), when either PDF is rendered, then it renders without an error.
30. The PDF responses have `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="KleeLab-<number>.pdf"` and `Cache-Control: private, no-store`.

**Email**
31. Given `MAILTRAP_API_TOKEN` is set and httpx is faked, when an invoice is emailed, then the JSON sent has one attachment with `filename` `KleeLab-INV-…pdf`, `type` `application/pdf`, `disposition` `attachment`, and base64 `content` that decodes to bytes starting `%PDF`. The staff message is HTML-escaped and `invoice.offline_email` is logged with the address.
32. Given a contact with no email and no `to`, when the email route is called, then the response is 409 "Add an email for this contact first". Given the provider fails, then the response is 502 and nothing is logged to the activity log.
33. Given a cancelled invoice or a voided receipt, when its email route is called, then the response is 409.
34. Existing emails (password reset, reminders) send the same payload as before. No `attachments` key is added when there are none.

**Reporting**
35. Given one project invoice and one offline invoice, when `GET /api/admin/invoices` is called, then both are returned with `source` set. Every field the project row had before has the same value as before.
36. Given a project invoice of USD 500 unpaid and an offline NGN 100,000 invoice with NGN 40,000 paid, when `GET /api/admin/stats` is called, then `unpaid` is USD 50,000 cents (count 1) and NGN 6,000,000 cents (count 1).
37. Given offline payments this month and last month, one of them voided, plus a standalone receipt this month, when stats are read, then `paid_this_month` counts only this month's payments that are not voided plus the receipt, by `paid_on` and `received_on`.
38. Given the Money page, when Offline is chosen, then only offline rows show. When "Part paid" is chosen, then only `part_paid` rows show. Each filter's count matches its list.
39. Given the CSV download, then the first 12 columns are the same as today, followed by Source, Amount paid, Balance and Promised by. A part-paid offline row has its status as `part_paid`, an empty Project column, and Amount paid plus Balance equal to Amount. A cell starting with `=` is still made safe.

**Admin screens**
40. Given a new contact typed in the invoice form, when the invoice is saved, then the contact exists, appears in the picker next time, and the invoice opens on `/money/offline/{id}`.
41. Given the Record payment dialog, when it opens, then the amount is pre-filled with the balance. Tab moves through every control in order, Esc closes the dialog, and a 422 message appears next to the amount field.
42. At 375, 768 and 1280 px wide, the Money list, the invoice page, the dialogs and the receipts list have no sideways scroll. All colours come from the Blueprint tokens.
43. `npm run typecheck`, `npm run lint` and `npm run build` pass in `kleelab-admin`, and the client dashboard's `kleelab-frontend` types are untouched.

## Risks
- **Downgrade loses money records.** Handled by the refusing `downgrade()` (criterion 3). To roll back with data in place, roll back only the code. Old code keeps working because it never reads the new tables, apart from the point below.
- **Rolling back the numbering code while offline invoices exist.** The old count-based `next_invoice_number` cannot see offline numbers and could issue an INV number an offline client already holds. Mitigation: release Part 1 as one unit and do not revert `services/numbering.py` once an offline invoice exists. If a revert is ever needed, keep `numbering.py` and the wrapper. This is in the release notes.
- **Counter lock.** Raising an invoice now waits on one row lock until commit. The volume is tiny, but a slow transaction holding the lock (for example sending an email before commit) would block other invoices. The builder checks the four callers (Part 1, Numbering). Emails are always sent after commit.
- **Overpayment race.** Handled by `SELECT … FOR UPDATE`, the `paid_cents <= amount_cents` check constraint and criterion 15.
- **Changing the `/admin/invoices` shape.** It becomes a discriminated union, and project rows only gain fields. The only consumer is MoneyView. `ClientDetail.invoices` reuses `AdminInvoiceOut` and only gains fields.
- **Today count meaning.** `paid_this_month.count` now counts payments. The only reader is TodayView, and its copy changes in the same part.
- **Personal data of people without accounts.** Staff-only routes, nothing public, and no client login. The retention policy is open question 1.
- **Email abuse.** Staff only, one email per click, and the address is logged. Attachments are capped at 5 MB.
- **PDF regression for online invoices.** Handled by the hash comparison in criterion 26.

## Build order
1. **backend-engineer A, Part 1 (sequential within the part):**
   1. `models/offline.py`, migration, `services/numbering.py`, and the wrapper in `services/projects.py`.
   2. `services/offline.py`, `schemas/offline.py`, `routers/offline.py`, and the mount in `main.py`.
2. **After step 1.1, these can run at the same time, because they touch different files:**
   - **backend-engineer B, Part 2:** `services/invoice_pdf.py` and `services/email.py`. Then add the PDF and email routes to `routers/offline.py` once A has finished step 1.2. Those routes are the only shared file, so the work is done in that order.
   - **backend-engineer C, Part 3 backend:** `routers/admin.py` (`stats`, `list_invoices`, the totals helpers) and `schemas/project.py` (`AdminInvoiceOut`, `OfflineMoneyInvoiceOut`).
3. **admin-engineer, after the backend is merged:**
   1. `types/api.ts`, `services/api.ts`, `components/project/format.ts` and `components/money/MoneyTabs.tsx`. This goes first, alone.
   2. Then, at the same time in separate worktrees:
      - **Part 3 admin:** `MoneyView.tsx`, `OfflineInvoiceRow.tsx` and `TodayView.tsx`.
      - **Part 4:** everything under `app/(team)/money/{offline,receipts,contacts}` and `components/money/offline/`.
4. **test-engineer:**
   - New CI check `kleelab-backend/scripts/check_offline_money.py`, with no database:
     - `line_amounts` arithmetic and limits (criteria 9 and 10)
     - the `recalculate` state table (criteria 12, 14, 16, 18 and 21, using in-memory objects)
     - the PDF text for criteria 27–29
     - the hash comparison for criterion 26, against a golden hash recorded from `main` before the refactor
     - the Mailtrap payload with httpx faked (criteria 31 and 34)
   - New db check `kleelab-backend/scripts/db_checks/check_offline_money.py`: criteria 1–8, 12–25, 30, 32, 33 and 35–37. That includes the concurrency checks for criteria 6 and 15 with separate sessions, and a check that the stored `amount_cents` equals the sum of the JSONB line amounts for every offline invoice and standalone receipt.
   - Extend `scripts/db_checks/check_retention.py` with criterion 4, and `check_money_clients.py` with "project rows unchanged in `/admin/invoices`" (criterion 35).
   - Add a row to `scripts/db_checks/README.md`: "`check_offline_money.py` | Offline contacts, invoices, part payments, receipts, shared numbering, PDFs and email, Money totals".
   - Admin criteria 11 and 38–43 are checked by qa-engineer in the browser.

## Release notes
- No new environment variables. These existing ones are reused: `INVOICE_FROM_ADDRESS`, `INVOICE_PAYMENT_DETAILS`, `REPLY_TO_EMAIL`, `TEAM_INBOX`, `MAILTRAP_API_TOKEN`.
- Migration `add_offline_money` runs automatically through the Render build (`alembic upgrade head`). It adds tables and seeds counters, and changes no existing rows.
- Before deploying, run the db checks against a copy of production numbers and confirm that the INV seed is higher than the highest invoice number in use.
- Do not revert `services/numbering.py` after the first offline invoice is raised (see Risks).
- Downgrade only works while there are no offline invoices or receipts.
