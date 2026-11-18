'use client';

import { useState } from 'react';
import { ArrowDownTrayIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { errorText, formatMoney, todayISO } from '@/components/project/format';
import { ApiError, apiService } from '@/services/api';
import type { OfflineInvoiceDetail, OfflinePayment, PaymentMethod } from '@/types/api';
import { Field, FormError, MethodField, Notice, chipClass } from './fields';
import { centsToInput, formProblem, orNull, parseMajor } from './helpers';
import { Modal } from './Modal';

/**
 * Record one payment against an invoice. The amount starts as the whole balance
 * and cannot go above it; the server's refusal is shown next to the amount.
 */
export function RecordPaymentDialog({
  invoice,
  onClose,
  onRecorded,
  onEmailReceipt,
}: {
  invoice: OfflineInvoiceDetail;
  onClose: () => void;
  onRecorded: (invoice: OfflineInvoiceDetail) => void;
  onEmailReceipt: (payment: OfflinePayment) => void;
}) {
  const balance = invoice.balance_cents;
  const [amount, setAmount] = useState(centsToInput(balance));
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayISO());
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<OfflinePayment | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cents = parseMajor(amount);
    const problems: Record<string, string> = {};
    if (cents === null || cents < 1) problems.amount = 'Type the amount received, such as 50000 or 1500.50.';
    else if (cents > balance) problems.amount = `That is more than the balance of ${formatMoney(balance, invoice.currency)}.`;
    if (!paidOn) problems.paid_on = 'Pick the day the money came in.';
    else if (paidOn > todayISO()) problems.paid_on = 'The payment date cannot be in the future.';
    setFields(problems);
    setMessage(null);
    if (Object.keys(problems).length) return;

    setBusy(true);
    try {
      const saved = await apiService.adminRecordOfflinePayment(invoice.id, {
        amount_cents: cents!,
        method,
        reference: orNull(reference),
        paid_on: paidOn,
        note: orNull(note),
      });
      onRecorded(saved);
      setDone(saved.payments[0] ?? null);
    } catch (reason) {
      const problem = formProblem(reason);
      const next = { ...problem.fields };
      if (next.amount_cents) next.amount = next.amount_cents;
      // The balance check answers with a plain 422 that is about the amount.
      if (reason instanceof ApiError && reason.status === 422 && reason.code !== 'validation_error') next.amount = reason.message;
      setFields(next);
      setMessage(Object.keys(next).length ? null : problem.message);
    } finally {
      setBusy(false);
    }
  }

  async function pdf(payment: OfflinePayment) {
    setPdfError(null);
    try {
      await apiService.downloadReceiptPdf({ id: payment.receipt_id, number: payment.receipt_number });
    } catch (reason) {
      setPdfError(errorText(reason));
    }
  }

  if (done) {
    return (
      <Modal title="Payment recorded" onClose={onClose}>
        <Notice>Recorded. Receipt {done.receipt_number} is ready.</Notice>
        <p className="mt-3 text-sm text-muted">
          {formatMoney(done.amount_cents, invoice.currency)} received on {invoice.number}.{' '}
          {invoice.balance_cents > 0 ? `${formatMoney(invoice.balance_cents, invoice.currency)} is still to pay.` : 'It is now paid in full.'}
        </p>
        {pdfError && <FormError message={pdfError} />}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => pdf(done)} className={chipClass}>
            <ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden />
            Receipt PDF
          </button>
          <button
            type="button"
            onClick={() => onEmailReceipt(done)}
            disabled={!invoice.contact.email}
            title={invoice.contact.email ? undefined : 'Add an email for this contact first'}
            className={chipClass}
          >
            <EnvelopeIcon className="h-3.5 w-3.5" aria-hidden />
            Email receipt
          </button>
          <Button type="button" size="sm" className="ml-auto" onClick={onClose} autoFocus>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Record a payment" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <p className="text-sm text-muted">
          {invoice.number} · balance {formatMoney(balance, invoice.currency)}
        </p>
        <Field label={`Amount received (${invoice.currency})`} error={fields.amount} hint={`Up to ${formatMoney(balance, invoice.currency)}.`}>
          {(p) => <input {...p} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" autoFocus className="field" />}
        </Field>
        <MethodField value={method} onChange={setMethod} error={fields.method} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference" error={fields.reference} hint="Optional, such as a transfer number.">
            {(p) => <input {...p} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} autoComplete="off" className="field" />}
          </Field>
          <Field label="Paid on" error={fields.paid_on}>
            {(p) => <input {...p} type="date" value={paidOn} max={todayISO()} min="2000-01-01" onChange={(e) => setPaidOn(e.target.value)} className="field" />}
          </Field>
        </div>
        <Field label="Note" error={fields.note}>
          {(p) => <input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoComplete="off" className="field" />}
        </Field>
        <FormError message={message} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Record payment'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
