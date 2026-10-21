'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { CheckIcon, EnvelopeIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { CopyEmail } from '@/components/ui/CopyEmail';
import { Button, buttonClass } from '@/components/ui/Button';
import { useCurrentUser } from '@/components/app/AppShell';
import { Panel, Pill } from '@/components/project/Pill';
import {
  budgetLabel,
  errorText,
  followUpDue,
  formatDate,
  formatDateTime,
  LEAD_STATUS,
  leadSource,
  todayISO,
} from '@/components/project/format';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import type { LeadDetail, LeadPatchInput, LeadStatus } from '@/types/api';

const STATUS_ACTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'We replied' },
  { value: 'won', label: 'Became a client' },
  { value: 'lost', label: 'Not going ahead' },
];

/** One enquiry: the message, a reply by email, notes, follow-up and status. */
export function LeadView({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminLead(leadId)
      .then((value) => active && setLead(value))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [leadId, attempt]);

  async function update(input: LeadPatchInput, message: string) {
    if (!lead) return;
    setError(null);
    try {
      const saved = await apiService.adminUpdateLead(lead.id, input);
      setLead({ ...lead, ...saved, notes: lead.notes, project_id: saved.project_id ?? lead.project_id });
      setNotice(message);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  if (!lead) {
    return (
      <div>
        <Link href="/leads" className="font-mono text-[11px] uppercase tracking-label text-muted no-underline hover:text-ink">← All enquiries</Link>
        {error ? (
          <ErrorState message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} className="mt-6" />
        ) : (
          <Skeleton rows={2} className="mt-6" />
        )}
      </div>
    );
  }

  const budget = budgetLabel(lead.budget);
  const open = lead.status === 'new' || lead.status === 'contacted';

  return (
    <div>
      <Link href="/leads" className="font-mono text-[11px] uppercase tracking-label text-muted no-underline hover:text-ink">← All enquiries</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={LEAD_STATUS[lead.status].tone}>{LEAD_STATUS[lead.status].label}</Pill>
            <span className="text-xs text-muted">{leadSource(lead.source)} · {formatDateTime(lead.created_at)}</span>
          </div>
          <h1 className="mt-2 break-words font-display text-3xl font-extrabold tracking-tightest sm:text-4xl">
            {lead.name || lead.email}
            {lead.company && <span className="font-bold text-muted"> · {lead.company}</span>}
          </h1>
        </div>
        {lead.project_id ? (
          <Link href={`/projects/${lead.project_id}`} className={buttonClass('secondary')}>Open their project</Link>
        ) : (
          lead.status !== 'lost' && (
            <Link href={`/projects?lead=${lead.id}`} className={buttonClass('primary')}>Start a project</Link>
          )
        )}
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
      {notice && !error && (
        <p role="status" className="mt-6 flex items-center gap-2 rounded-xl bg-mint p-3 text-sm text-ink">
          <CheckIcon className="h-4 w-4" aria-hidden />
          {notice}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-6">
          <Panel tag="their message" title={lead.feature_requested || 'Enquiry'}>
            {lead.message ? (
              <p className="whitespace-pre-line break-words text-sm leading-7 text-ink-soft">{lead.message}</p>
            ) : (
              <p className="text-sm text-muted">No message was left.</p>
            )}
          </Panel>

          <ReplyBox
            lead={lead}
            onSent={(next) => {
              setLead(next);
              setError(null);
              setNotice(`Email sent to ${next.email}.`);
            }}
            onError={setError}
          />

          <History
            lead={lead}
            onAdded={(next) => {
              setLead(next);
              setError(null);
              setNotice('Note saved.');
            }}
            onError={setError}
          />
        </div>

        <aside className="grid content-start gap-6">
          <Panel tag="where it stands" title="Status">
            <div className="flex flex-wrap gap-2">
              {STATUS_ACTIONS.map((s) => {
                const blocked = s.value === 'won' && !lead.project_id;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={lead.status === s.value || blocked}
                    title={blocked ? 'Start a project from this enquiry first' : undefined}
                    onClick={() => update({ status: s.value }, `Marked as “${s.label}”.`)}
                    className={clsx(
                      'rounded-full px-3 py-1.5 text-xs font-medium',
                      lead.status === s.value ? 'bg-ink text-paper' : 'border-[1.5px] border-line hover:border-ink disabled:opacity-40 disabled:hover:border-line',
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </Panel>

          <FollowUp key={lead.follow_up_on ?? 'none'} lead={lead} open={open} onSave={(value, message) => update({ follow_up_on: value }, message)} />

          <Panel tag="contact" title="Details">
            <dl className="grid gap-3 text-sm">
              <Detail label="Email">
                <CopyEmail email={lead.email} />
              </Detail>
              {lead.company && <Detail label="Company">{lead.company}</Detail>}
              {lead.interest && <Detail label="Wants">{lead.interest}</Detail>}
              {budget && <Detail label="Budget">{budget}</Detail>}
              <Detail label="Came from">{leadSource(lead.source)}</Detail>
              <Detail label="Received">{formatDateTime(lead.created_at)}</Detail>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-label text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
    </div>
  );
}

function FollowUp({ lead, open, onSave }: { lead: LeadDetail; open: boolean; onSave: (value: string | null, message: string) => void }) {
  const [value, setValue] = useState(lead.follow_up_on ?? '');
  const due = followUpDue(lead);

  const quick = [
    { label: 'Tomorrow', days: 1 },
    { label: 'In 3 days', days: 3 },
    { label: 'Next week', days: 7 },
  ];

  return (
    <Panel tag={due ? 'due now' : 'reminder'} title="Follow up">
      {!open && <p className="mb-3 text-xs text-muted">This enquiry is closed, so it will not show on Today.</p>}
      <p className="text-sm text-muted">
        {lead.follow_up_on ? (
          <>
            Chase on <strong className={clsx(due ? 'text-danger' : 'text-ink')}>{formatDate(lead.follow_up_on)}</strong>. It shows on Today from that day.
          </>
        ) : (
          'No date set. Pick one and it will show on Today when it comes round.'
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q.days}
            type="button"
            onClick={() => onSave(todayISO(q.days), `Follow-up set for ${formatDate(todayISO(q.days))}.`)}
            className="rounded-full border-[1.5px] border-line px-3 py-1 text-xs hover:border-ink"
          >
            {q.label}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onSave(value, `Follow-up set for ${formatDate(value)}.`);
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="follow_up_on" className="sr-only">Follow-up date</label>
          <input id="follow_up_on" type="date" value={value} onChange={(e) => setValue(e.target.value)} className="field py-2 text-sm" />
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={!value || value === lead.follow_up_on}>
          Set
        </Button>
      </form>
      {lead.follow_up_on && (
        <button type="button" onClick={() => onSave(null, 'Follow-up cleared.')} className="mt-3 text-xs font-semibold text-cobalt">
          Clear the date
        </button>
      )}
    </Panel>
  );
}

function ReplyBox({ lead, onSent, onError }: { lead: LeadDetail; onSent: (lead: LeadDetail) => void; onError: (message: string) => void }) {
  const user = useCurrentUser();
  const firstName = lead.name?.split(' ')[0];
  const [subject, setSubject] = useState('Your enquiry to KleeLab');
  const [body, setBody] = useState(`Hi ${firstName || 'there'},\n\nThank you for getting in touch with KleeLab.\n\n`);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const sender = user.full_name || user.email.split('@')[0];

  async function send() {
    setBusy(true);
    try {
      const next = await apiService.adminReplyToLead(lead.id, subject.trim(), body.trim());
      setConfirming(false);
      setBody(`Hi ${firstName || 'there'},\n\n`);
      onSent(next);
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const ready = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <Panel tag="by email" title={`Reply to ${firstName || lead.email}`} className="shadow-block">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return onError('Write a subject and a message first.');
          if (!confirming) return setConfirming(true);
          void send();
        }}
      >
        <p className="text-xs leading-5 text-muted">
          Goes to <strong className="text-ink">{lead.email}</strong> from KleeLab, signed &ldquo;{sender}, KleeLab&rdquo;. Their reply comes back to the team inbox, and a copy is kept below.
        </p>
        <div>
          <label htmlFor="reply_subject" className="label">Subject</label>
          <input id="reply_subject" value={subject} onChange={(e) => { setSubject(e.target.value); setConfirming(false); }} maxLength={200} className="field" />
        </div>
        <div>
          <label htmlFor="reply_body" className="label">Message</label>
          <textarea id="reply_body" rows={8} value={body} onChange={(e) => { setBody(e.target.value); setConfirming(false); }} maxLength={10000} className="field leading-6" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !ready} variant={confirming ? 'sun' : 'primary'}>
            <EnvelopeIcon className="h-4 w-4" aria-hidden />
            {busy ? 'Sending…' : confirming ? `Yes, send to ${lead.email}` : 'Send email'}
          </Button>
          {confirming && !busy && (
            <button type="button" onClick={() => setConfirming(false)} className="text-sm text-muted hover:text-ink">
              Cancel
            </button>
          )}
        </div>
      </form>
    </Panel>
  );
}

function History({ lead, onAdded, onError }: { lead: LeadDetail; onAdded: (lead: LeadDetail) => void; onError: (message: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      const next = await apiService.adminAddLeadNote(lead.id, note.trim());
      setNote('');
      onAdded(next);
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const entries = [...lead.notes].reverse();

  return (
    <Panel tag={`${lead.notes.length} ${lead.notes.length === 1 ? 'entry' : 'entries'}`} title="History">
      <form onSubmit={add} className="grid gap-2">
        <label htmlFor="lead_note" className="label">Add a private note</label>
        <textarea
          id="lead_note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={5000}
          placeholder="Called them, they want a quote by Friday…"
          className="field"
        />
        <p className="text-xs text-muted">Only the team sees notes.</p>
        <div>
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !note.trim()}>
            {busy ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </form>

      {entries.length > 0 && (
        <ol className="mt-6 grid gap-4 border-t border-line pt-6">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span
                className={clsx(
                  'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px]',
                  entry.kind === 'email' ? 'border-cobalt bg-cobalt-soft text-cobalt-dark' : 'border-line bg-paper text-muted',
                )}
                aria-hidden
              >
                {entry.kind === 'email' ? <EnvelopeIcon className="h-4 w-4" /> : <PencilSquareIcon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  <span className="font-semibold text-ink">{entry.author_name || 'Someone on the team'}</span>
                  {entry.kind === 'email' ? ' emailed them' : ' added a note'} · {formatDateTime(entry.created_at)}
                </p>
                {entry.subject && <p className="mt-1 text-sm font-semibold">{entry.subject}</p>}
                <p className="mt-1 whitespace-pre-line break-words rounded-xl bg-paper p-3 text-sm leading-6 text-ink-soft">{entry.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
