'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { PhoneIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { CopyEmail } from '@/components/ui/CopyEmail';
import { Pill } from '@/components/project/Pill';
import { errorText } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { TeamCall } from '@/types/api';

const WHEN = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function callWhen(iso: string): string {
  return WHEN.format(new Date(iso));
}

export function isPast(call: TeamCall): boolean {
  return new Date(call.starts_at).getTime() <= Date.now();
}

function state(call: TeamCall): { label: string; tone: string } {
  if (call.status === 'cancelled') {
    return { label: call.cancelled_by === 'team' ? 'We cancelled' : 'They cancelled', tone: 'bg-line text-muted' };
  }
  if (isPast(call)) return { label: 'Happened', tone: 'bg-mint text-ink' };
  const hours = (new Date(call.starts_at).getTime() - Date.now()) / 3_600_000;
  return hours < 24 ? { label: 'Within a day', tone: 'bg-sun text-ink' } : { label: 'Booked', tone: 'bg-cobalt-soft text-cobalt-dark' };
}

/** One booked call. The team can cancel a call still to come; the booker is emailed with the reason. */
export function CallCard({
  call,
  onChange,
  showLead = true,
}: {
  call: TeamCall;
  onChange: (call: TeamCall) => void;
  showLead?: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = state(call);
  const live = call.status === 'booked' && !isPast(call);
  const firstName = call.name.split(' ')[0];

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      onChange(await apiService.adminCancelCall(call.id, reason.trim()));
      setCancelling(false);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={clsx('card p-5', !live && 'opacity-80')}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={s.tone}>{s.label}</Pill>
        <span className="text-xs text-muted">{call.duration_minutes} min</span>
      </div>
      <h3 className={clsx('mt-2 flex items-center gap-2 font-display text-xl font-extrabold tracking-tight', call.status === 'cancelled' && 'text-muted line-through')}>
        <PhoneIcon className="h-4 w-4 shrink-0" aria-hidden />
        {callWhen(call.starts_at)}
      </h3>
      {showLead && (
        <>
          <p className="mt-1 text-sm">
            <Link href={`/leads/${call.lead_id}`} className="font-semibold text-ink no-underline hover:text-cobalt">
              {call.name}
              {call.company && <span className="font-normal text-muted"> · {call.company}</span>}
            </Link>
          </p>
          <div className="mt-0.5 text-sm text-muted">
            <CopyEmail email={call.email} />
          </div>
        </>
      )}
      {call.phone && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <a href={`tel:${call.phone}`} className="font-mono text-ink no-underline hover:text-cobalt">{call.phone}</a>
          <a href={`https://wa.me/${call.phone.slice(1)}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-cobalt">
            WhatsApp
          </a>
        </p>
      )}
      {call.notes &&<p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink-soft">{call.notes}</p>}
      {call.status === 'cancelled' && call.cancel_reason && (
        <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm text-muted">Reason: {call.cancel_reason}</p>
      )}
      {live && !cancelling && (
        <button type="button" onClick={() => setCancelling(true)} className="mt-3 text-sm font-semibold text-danger underline-offset-4 hover:underline">
          Cancel this call
        </button>
      )}
      {live && cancelling && (
        <div className="mt-4 grid gap-3 border-t border-line pt-4">
          <div>
            <label htmlFor={`reason-${call.id}`} className="label">Reason (emailed to {firstName})</label>
            <textarea
              id={`reason-${call.id}`}
              rows={2}
              maxLength={1000}
              className="field resize-y text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Something came up on our side. Sorry, please pick another time."
            />
          </div>
          <p className="text-xs text-muted">They get an email with a link to book another time.</p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={cancel} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel and email them'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCancelling(false)} disabled={busy}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
