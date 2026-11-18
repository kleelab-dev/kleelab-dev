'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { errorText } from '@/components/project/format';
import { apiService } from '@/services/api';
import { Field, FormError, Notice } from './fields';
import { orNull } from './helpers';
import { Modal } from './Modal';

/**
 * Email an invoice or a receipt as a PDF. The address starts as the contact's
 * and can be changed for this one send. `defaultTo` is null when the contact has
 * no email, and undefined when it is not known here (the server then uses theirs).
 */
export function EmailDocumentDialog({
  kind,
  id,
  number,
  defaultTo,
  onClose,
}: {
  kind: 'invoice' | 'receipt';
  id: string;
  number: string;
  defaultTo?: string | null;
  onClose: () => void;
}) {
  const [to, setTo] = useState(defaultTo ?? '');
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const address = to.trim();
  const unknown = defaultTo === undefined;
  const noAddress = !address && !unknown;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (address && !/^\S+@\S+\.\S+$/.test(address)) {
      setFieldError('That does not look like an email address.');
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      const input = { to: orNull(address), message: orNull(text) };
      const result = kind === 'invoice' ? await apiService.emailOfflineInvoice(id, input) : await apiService.emailReceipt(id, input);
      setSentTo(result.to);
    } catch (reason) {
      setMessage(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <Modal title={`Email ${number}`} onClose={onClose}>
        <Notice>Sent to {sentTo}</Notice>
        <div className="mt-5 flex justify-end">
          <Button type="button" size="sm" onClick={onClose} autoFocus>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Email ${number}`} onClose={onClose} busy={busy}>
      <form onSubmit={send} noValidate className="grid gap-4">
        <p className="text-sm text-muted">The {kind} goes as a PDF attachment, from KleeLab, and a copy of the send is kept in the activity log.</p>
        <Field
          label="To"
          error={fieldError}
          hint={noAddress ? 'Add an email for this contact first, or type an address here.' : unknown ? 'Leave empty to use the contact’s email.' : undefined}
        >
          {(p) => <input {...p} type="email" value={to} onChange={(e) => setTo(e.target.value)} maxLength={255} autoComplete="off" autoFocus className="field" />}
        </Field>
        <Field label="Message" hint="Optional. Shown above the document details.">
          {(p) => <textarea {...p} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} className="field" />}
        </Field>
        <FormError message={message} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={busy || noAddress}
            title={noAddress ? 'Add an email for this contact first' : undefined}
          >
            {busy ? 'Sending…' : 'Send email'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
