'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { OfflineContact, OfflineContactInput } from '@/types/api';
import { Field, FormError } from './fields';
import { formProblem, orNull } from './helpers';

/**
 * Name, company, email, phone and address. `onSubmit` may be async and may throw:
 * a 422 is shown next to the field it is about.
 */
export function ContactForm({
  initial,
  submitLabel = 'Save contact',
  onSubmit,
  onCancel,
  nested = false,
  autoFocus = false,
}: {
  initial?: OfflineContact | OfflineContactInput | null;
  submitLabel?: string;
  onSubmit: (values: OfflineContactInput) => void | Promise<void>;
  onCancel?: () => void;
  /** Set when this sits inside another `<form>`, where a second form is not allowed. */
  nested?: boolean;
  /** Put the cursor in the name box when the form appears. */
  autoFocus?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [company, setCompany] = useState(initial?.company ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event?: React.SyntheticEvent) {
    event?.preventDefault();
    const problems: Record<string, string> = {};
    if (name.trim().length < 2) problems.name = 'Add a name of at least 2 letters.';
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) problems.email = 'That does not look like an email address.';
    if (phone && !/^[0-9+()\-\s.]*$/.test(phone)) problems.phone = 'Use digits, spaces and + ( ) - . only.';
    setFields(problems);
    setMessage(null);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        company: orNull(company),
        email: orNull(email),
        phone: orNull(phone),
        address: orNull(address),
      });
    } catch (reason) {
      const problem = formProblem(reason);
      setFields(problem.fields);
      setMessage(Object.keys(problem.fields).length ? null : problem.message);
    } finally {
      setBusy(false);
    }
  }

  const Wrapper = nested ? 'div' : 'form';
  const wrapperProps = nested
    ? {
        role: 'group',
        'aria-label': 'Contact details',
        // Enter in a text box saves the contact instead of submitting the invoice around it.
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            void submit();
          }
        },
      }
    : { onSubmit: submit, noValidate: true };

  return (
    <Wrapper {...wrapperProps} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={fields.name} className="sm:col-span-2">
          {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoComplete="off" autoFocus={autoFocus} className="field" />}
        </Field>
        <Field label="Company" error={fields.company}>
          {(p) => <input {...p} value={company} onChange={(e) => setCompany(e.target.value)} maxLength={150} autoComplete="off" className="field" />}
        </Field>
        <Field label="Email" error={fields.email} hint="Needed to email documents to them.">
          {(p) => <input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} autoComplete="off" className="field" />}
        </Field>
        <Field label="Phone" error={fields.phone}>
          {(p) => <input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="off" className="field" />}
        </Field>
        <Field label="Address" error={fields.address} className="sm:col-span-2">
          {(p) => <textarea {...p} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} rows={3} className="field" />}
        </Field>
      </div>
      <FormError message={message} />
      <div className="flex flex-wrap gap-2">
        <Button type={nested ? 'button' : 'submit'} onClick={nested ? () => void submit() : undefined} disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </Wrapper>
  );
}
