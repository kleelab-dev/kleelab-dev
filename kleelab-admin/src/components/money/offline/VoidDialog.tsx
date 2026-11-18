'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { errorText } from '@/components/project/format';
import { Field, FormError } from './fields';
import { Modal } from './Modal';

/**
 * Void a payment or a receipt. Voiding keeps the record, so a reason is required.
 * `onConfirm` does the work; if it throws, its message is shown and the dialog stays open.
 */
export function VoidDialog({
  title,
  body,
  confirmLabel = 'Void',
  onConfirm,
  onClose,
}: {
  title: string;
  /** What will happen, in a sentence or two. */
  body: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = reason.trim();
    setMessage(null);
    if (text.length < 3) {
      setFieldError('Say why, in at least 3 letters.');
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      await onConfirm(text);
    } catch (failure) {
      setMessage(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <p className="text-sm text-ink-soft">{body}</p>
        <Field label="Reason" error={fieldError} hint="Kept with the record. 3 to 300 characters.">
          {(p) => <textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} autoFocus className="field" />}
        </Field>
        <FormError message={message} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? 'Voiding…' : confirmLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** A yes or no that says what will happen. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    setMessage(null);
    try {
      await onConfirm();
    } catch (failure) {
      setMessage(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <div className="grid gap-4">
        <p className="text-sm text-ink-soft">{body}</p>
        <FormError message={message} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={danger ? 'danger' : 'primary'} onClick={go} disabled={busy} autoFocus data-autofocus>
            {busy ? 'Working…' : confirmLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Not now
          </Button>
        </div>
      </div>
    </Modal>
  );
}
