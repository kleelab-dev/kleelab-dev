'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { CURRENCIES, formatMoney, todayISO } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { Currency, OfflineLineInput, PaymentMethod } from '@/types/api';
import { contactPayload, ContactPicker, type PickedContact } from './ContactPicker';
import { Field, FormError, MethodField } from './fields';
import { clearContactError, formProblem, linesProblem, newLine, orNull, parseMajor, toLineInputs, type LineDraft } from './helpers';
import { LineItemsEditor } from './LineItemsEditor';

type Mode = 'single' | 'lines';

/** Record money taken with no invoice. It gets its own receipt number and PDF. */
export function ReceiptForm() {
  const router = useRouter();
  const preselect = useSearchParams().get('contact');
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [currency, setCurrency] = useState<Currency>('NGN');
  const [mode, setMode] = useState<Mode>('single');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('Payment received');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [receivedOn, setReceivedOn] = useState(todayISO());
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preloadFailed, setPreloadFailed] = useState(false);

  // "Record receipt" from a contact page arrives with `?contact=<id>`.
  useEffect(() => {
    if (!preselect) return;
    let active = true;
    apiService
      .adminOfflineContact(preselect)
      .then((found) => active && !found.archived_at && setContact({ kind: 'existing', contact: found }))
      .catch(() => active && setPreloadFailed(true));
    return () => {
      active = false;
    };
  }, [preselect]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (!contact) problems.contact = 'Pick who paid, or add a new contact.';
    let payload: OfflineLineInput[] = [];
    if (mode === 'single') {
      const cents = parseMajor(amount);
      if (cents === null || cents < 1) problems.amount = 'Type the amount received, such as 50000 or 1500.50.';
      else payload = [{ description: purpose.trim() || 'Payment received', quantity: 1, unit_price_cents: cents }];
      if (purpose.length > 200) problems.purpose = 'Keep it under 200 characters.';
    } else {
      const issue = linesProblem(lines);
      if (issue) problems.lines = issue;
      else payload = toLineInputs(lines);
    }
    if (!receivedOn) problems.received_on = 'Pick the day the money came in.';
    else if (receivedOn > todayISO()) problems.received_on = 'The date cannot be in the future.';
    setFields(problems);
    setMessage(null);
    if (Object.keys(problems).length) return;

    setBusy(true);
    try {
      const saved = await apiService.adminCreateReceipt({
        ...contactPayload(contact!),
        currency,
        lines: payload,
        method,
        reference: orNull(reference),
        received_on: receivedOn,
        note: orNull(note),
      });
      router.push(`/money/receipts?created=${encodeURIComponent(saved.id)}`);
    } catch (reason) {
      const problem = formProblem(reason);
      setFields(problem.fields);
      setMessage(problem.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <div>
        <ContactPicker
          value={contact}
          onChange={(next) => {
            setContact(next);
            if (next) setFields(clearContactError);
          }}
          error={fields.contact ?? fields.contact_id}
          label="Received from"
        />
        {preloadFailed && <p className="mt-1 text-xs text-muted">That contact could not be loaded. Search for them above.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
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
        <fieldset>
          <legend className="label">What was received</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['single', 'Single amount'],
                ['lines', 'Line items'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={clsx(
                  'inline-flex cursor-pointer items-center rounded-full border-[1.5px] px-3.5 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt',
                  mode === value ? 'border-ink bg-ink text-paper' : 'border-line bg-white hover:border-ink',
                )}
              >
                <input type="radio" name="receipt-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {mode === 'single' ? (
        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <Field label={`Amount (${currency})`} error={fields.amount}>
            {(p) => <input {...p} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" className="field" />}
          </Field>
          <Field label="For" error={fields.purpose} hint="Printed on the receipt.">
            {(p) => <input {...p} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={200} autoComplete="off" className="field" />}
          </Field>
        </div>
      ) : (
        <LineItemsEditor lines={lines} onChange={setLines} currency={currency} error={fields.lines} />
      )}

      <MethodField value={method} onChange={setMethod} error={fields.method} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reference" error={fields.reference} hint="Optional, such as a transfer number.">
          {(p) => <input {...p} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} autoComplete="off" className="field" />}
        </Field>
        <Field label="Received on" error={fields.received_on}>
          {(p) => <input {...p} type="date" value={receivedOn} max={todayISO()} min="2000-01-01" onChange={(e) => setReceivedOn(e.target.value)} className="field" />}
        </Field>
      </div>
      <Field label="Note" error={fields.note} hint="Optional. Kept with the receipt.">
        {(p) => <textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="field" />}
      </Field>

      <FormError message={message} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : mode === 'single' && parseMajor(amount) ? `Record ${formatMoney(parseMajor(amount)!, currency)}` : 'Record receipt'}
        </Button>
        <Link href="/money/receipts" className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold text-ink no-underline hover:bg-ink/5">
          Cancel
        </Link>
      </div>
    </form>
  );
}
