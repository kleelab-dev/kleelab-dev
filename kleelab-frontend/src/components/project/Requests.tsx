'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import type { ProjectRequest, RequestKind } from '@/types/api';
import { formatDate, REQUEST_KIND, REQUEST_STATUS } from './format';
import { Pill } from './Pill';

const KINDS: RequestKind[] = ['deployment', 'hosting', 'maintenance', 'change'];

export function RequestList({
  requests,
  renderControls,
  team = false,
}: {
  requests: ProjectRequest[];
  renderControls?: (request: ProjectRequest) => React.ReactNode;
  team?: boolean;
}) {
  if (!requests.length) return null;
  const ordered = [...requests].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <ul className="grid gap-2">
      {ordered.map((request) => (
        <li key={request.id} className="rounded-xl border-[1.5px] border-line bg-white p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{REQUEST_KIND[request.kind].label}</span>
            <Pill tone={REQUEST_STATUS[request.status].tone}>{team ? REQUEST_STATUS[request.status].teamLabel : REQUEST_STATUS[request.status].label}</Pill>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-label text-muted">{formatDate(request.created_at)}</span>
          </div>
          {request.message && <p className="mt-1.5 whitespace-pre-line break-words text-sm text-muted">{request.message}</p>}
          {renderControls && <div className="mt-2.5">{renderControls(request)}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Ask for an extra service or a change. The team replies in the messages. */
export function RequestForm({ onRequest }: { onRequest: (kind: RequestKind, message: string) => Promise<void> }) {
  const [kind, setKind] = useState<RequestKind | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return setError('Pick one of the options first.');
    setBusy(true);
    setError(null);
    try {
      await onRequest(kind, message.trim());
      setKind(null);
      setMessage('');
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That did not send. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <fieldset>
        <legend className="label">I would like</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => {
                setKind(option);
                setSent(false);
              }}
              className={clsx(
                'rounded-xl border-[1.5px] p-3 text-left transition-colors',
                kind === option ? 'border-cobalt bg-cobalt-soft' : 'border-line bg-white hover:border-ink',
              )}
            >
              <span className="block text-sm font-semibold">{REQUEST_KIND[option].label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted">{REQUEST_KIND[option].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="request-message" className="label">Anything we should know? (optional)</label>
        <textarea id="request-message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className="field" maxLength={2000} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {sent && <p role="status" className="text-sm text-ink">Sent. We will reply here with a price or any questions.</p>}
      <div>
        <Button type="submit" variant="secondary" size="sm" className="min-h-11 sm:min-h-0" disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
