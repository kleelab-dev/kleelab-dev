'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { CURRENCIES, toDateInput } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { Currency, OfflineInvoiceDetail, OfflineInvoicePatchInput } from '@/types/api';
import { contactPayload, ContactPicker, type PickedContact } from './ContactPicker';
import { Field, FormError } from './fields';
import { clearContactError, draftsFromLines, formProblem, linesProblem, newLine, orNull, toLineInputs, type LineDraft } from './helpers';
import { LineItemsEditor } from './LineItemsEditor';

/**
 * Raise an offline invoice, or edit one. While nothing has been paid every field
 * can change; once a payment is in, only the due date and notes can.
 */
export function OfflineInvoiceForm({
  invoice,
  onSaved,
  onCancel,
}: {
  invoice?: OfflineInvoiceDetail;
  onSaved?: (invoice: OfflineInvoiceDetail) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const preselect = useSearchParams().get('contact');
  const editing = Boolean(invoice);
  const full = !invoice || invoice.editable;

  const [contact, setContact] = useState<PickedContact | null>(invoice ? { kind: 'existing', contact: invoice.contact } : null);
  const [title, setTitle] = useState(invoice?.title ?? '');
  const [currency, setCurrency] = useState<Currency>(invoice?.currency ?? 'NGN');
  const [lines, setLines] = useState<LineDraft[]>(() => (invoice ? draftsFromLines(invoice.lines) : [newLine()]));
  const [dueDate, setDueDate] = useState(toDateInput(invoice?.due_date));
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preloadFailed, setPreloadFailed] = useState(false);

  // "New invoice" from a contact page arrives with `?contact=<id>`.
  useEffect(() => {
    if (invoice || !preselect) return;
    let active = true;
    apiService
      .adminOfflineContact(preselect)
      .then((found) => active && !found.archived_at && setContact({ kind: 'existing', contact: found }))
      .catch(() => active && setPreloadFailed(true));
    return () => {
      active = false;
    };
  }, [invoice, preselect]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (full) {
      if (!contact) problems.contact = 'Pick who this invoice is for, or add a new contact.';
      if (title.trim().length < 2) problems.title = 'Give the invoice a title of at least 2 letters.';
      const linesIssue = linesProblem(lines);
      if (linesIssue) problems.lines = linesIssue;
    }
    if (notes.length > 1000) problems.notes = 'Notes can be up to 1,000 characters.';
    setFields(problems);
    setMessage(null);
    if (Object.keys(problems).length) return;

    setBusy(true);
    try {
      let saved: OfflineInvoiceDetail;
      if (invoice) {
        const patch: OfflineInvoicePatchInput = { due_date: dueDate || null, notes: orNull(notes) };
        if (full) {
          patch.title = title.trim();
          patch.currency = currency;
          patch.lines = toLineInputs(lines);
          if (contact?.kind === 'existing' && contact.contact.id !== invoice.contact.id) patch.contact_id = contact.contact.id;
        }
        saved = await apiService.adminUpdateOfflineInvoice(invoice.id, patch);
      } else {
        saved = await apiService.adminCreateOfflineInvoice({
          ...contactPayload(contact!),
          title: title.trim(),
          lines: toLineInputs(lines),
          currency,
          due_date: dueDate || null,
          notes: orNull(notes),
        });
      }
      if (onSaved) onSaved(saved);
      else router.push(`/money/offline/${saved.id}`);
    } catch (reason) {
      const problem = formProblem(reason);
      setFields(problem.fields);
      setMessage(problem.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      {!full && (
        <p className="rounded-xl bg-sun-soft p-3 text-sm text-ink">
          A payment has been recorded, so the lines, currency and contact are locked. You can still change the due date and the notes.
        </p>
      )}
      {full && (
        <div>
          <ContactPicker
            value={contact}
            onChange={(next) => {
              setContact(next);
              if (next) setFields(clearContactError);
            }}
            error={fields.contact ?? fields.contact_id}
            label="Invoice for"
            allowNew={!editing}
          />
          {preloadFailed && <p className="mt-1 text-xs text-muted">That contact could not be loaded. Search for them above.</p>}
          {invoice && contact?.kind === 'existing' && contact.contact.id !== invoice.contact.id && (
            <p className="mt-1 text-xs text-muted">The bill-to details on the invoice will be copied again from this contact.</p>
          )}
        </div>
      )}
      {full && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Field label="Title" error={fields.title} hint="Shown at the top of the invoice, such as “Logo and brand sheet”.">
            {(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} autoComplete="off" className="field" />}
          </Field>
          <Field label="Currency" error={fields.currency}>
            {(p) => (
              <select {...p} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="field">
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      )}
      {full && <LineItemsEditor lines={lines} onChange={setLines} currency={currency} error={fields.lines} />}
      <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <Field label="Due date" error={fields.due_date} hint="Optional. Leave empty for “On receipt”.">
          {(p) => <input {...p} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field" />}
        </Field>
        <Field label="Notes" error={fields.notes} hint="Printed on the PDF.">
          {(p) => <textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} className="field" />}
        </Field>
      </div>
      <FormError message={message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create invoice'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : (
          <Link href="/money" className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold text-ink no-underline hover:bg-ink/5">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
