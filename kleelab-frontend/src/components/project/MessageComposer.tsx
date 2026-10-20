'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/** A plain message box. Clears itself once the message is saved. */
export function MessageComposer({ onSend, placeholder }: { onSend: (body: string) => Promise<void>; placeholder?: string }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body.trim());
      setBody('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That did not send. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <label htmlFor="message" className="sr-only">Message</label>
      <textarea
        id="message"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder ?? 'Ask a question or share something with the team…'}
        className="field"
        maxLength={5000}
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : 'Send message'}
        </Button>
      </div>
    </form>
  );
}
