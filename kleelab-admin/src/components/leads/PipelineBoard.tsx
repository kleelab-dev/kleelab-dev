'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import type { Lead, LeadStatus } from '@/types/api';
import { budgetLabel, errorText, followUpDue, formatDate, LEAD_STATUS, LEAD_STATUSES, leadIsOpen, timeAgo } from '@/components/project/format';

const HINT: Record<LeadStatus, string> = {
  new: 'Not answered yet',
  contacted: 'Talking by email',
  call: 'A call is booked',
  proposal: 'Waiting on their answer',
  won: 'Project started',
  lost: 'Closed',
};

function blockedReason(lead: Lead, to: LeadStatus): string | null {
  if (to === 'won' && !lead.project_id) return 'Start a project from this enquiry to mark it as a client.';
  return null;
}

/**
 * The enquiries as a board, one column per stage of the pipeline. Drag a card to
 * move it, or use its "Move to" menu (which also works from the keyboard).
 */
export function PipelineBoard({ leads, onChange }: { leads: Lead[]; onChange: (lead: Lead) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  async function move(lead: Lead, to: LeadStatus) {
    if (lead.status === to) return;
    const blocked = blockedReason(lead, to);
    if (blocked) return setMessage({ tone: 'error', text: blocked });
    const from = lead.status;
    setBusy(lead.id);
    setMessage(null);
    // Move it straight away; put it back if the save fails.
    onChange({ ...lead, status: to });
    try {
      onChange(await apiService.adminUpdateLead(lead.id, { status: to }));
      setMessage({ tone: 'ok', text: `${lead.name || lead.email} moved to “${LEAD_STATUS[to].label}”.` });
    } catch (reason) {
      onChange({ ...lead, status: from });
      setMessage({ tone: 'error', text: errorText(reason, 'That move did not save. Try again.') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={clsx('mb-4 rounded-xl p-3 text-sm', message.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-mint text-ink')}>
          {message.text}
        </p>
      )}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-0 sm:px-0">
        <div className="grid min-w-[1380px] grid-cols-6 gap-3">
          {LEAD_STATUSES.map((status) => {
            const column = leads.filter((l) => l.status === status);
            const target = dragging !== null && over === status;
            return (
              <section
                key={status}
                aria-label={LEAD_STATUS[status].label}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (over !== status) setOver(status);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const lead = leads.find((l) => l.id === e.dataTransfer.getData('text/plain'));
                  setOver(null);
                  setDragging(null);
                  if (lead) void move(lead, status);
                }}
                className={clsx(
                  'flex min-h-[420px] flex-col rounded-2xl border-[1.5px] p-2.5 transition-colors',
                  target ? 'border-dashed border-cobalt bg-cobalt-soft' : 'border-line bg-paper',
                )}
              >
                <header className="px-1.5 pb-2.5 pt-1">
                  <div className="flex items-center gap-2">
                    <span className={clsx('h-2.5 w-2.5 rounded-full border border-ink', LEAD_STATUS[status].tone.split(' ')[0])} aria-hidden />
                    <h2 className="text-sm font-semibold">{LEAD_STATUS[status].label}</h2>
                    <span className="ml-auto font-mono text-[11px] text-muted">{column.length}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{HINT[status]}</p>
                </header>
                <ul className="grid content-start gap-2">
                  {column.map((lead) => (
                    <Card
                      key={lead.id}
                      lead={lead}
                      busy={busy === lead.id}
                      dragging={dragging === lead.id}
                      onDragStart={() => setDragging(lead.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onMove={(to) => move(lead, to)}
                    />
                  ))}
                  {column.length === 0 && (
                    <li className="rounded-xl border-[1.5px] border-dashed border-line px-3 py-6 text-center text-xs text-muted">
                      {dragging ? 'Drop here' : 'Nothing here'}
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Card({
  lead,
  busy,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  lead: Lead;
  busy: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: LeadStatus) => void;
}) {
  const budget = budgetLabel(lead.budget);
  const due = followUpDue(lead);
  return (
    <li
      draggable={!busy}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={clsx(
        'cursor-grab rounded-xl border-[1.5px] border-ink bg-white p-3 active:cursor-grabbing',
        dragging && 'opacity-40',
        busy && 'opacity-60',
      )}
    >
      <Link href={`/leads/${lead.id}`} className="block text-sm font-semibold text-ink no-underline hover:text-cobalt" draggable={false}>
        {lead.name || lead.email}
      </Link>
      {lead.company && <p className="truncate text-xs text-muted">{lead.company}</p>}
      {(lead.interest || budget) && (
        <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft">
          {[lead.interest, budget].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span title={formatDate(lead.created_at)}>{timeAgo(lead.created_at)}</span>
        {lead.follow_up_on && leadIsOpen(lead.status) && (
          <span className={clsx('inline-flex items-center gap-1', due && 'font-semibold text-danger')}>
            <CalendarDaysIcon className="h-3 w-3" aria-hidden />
            {due ? 'Follow up now' : formatDate(lead.follow_up_on)}
          </span>
        )}
      </div>
      <label className="mt-2.5 block">
        <span className="sr-only">Move {lead.name || lead.email} to</span>
        <select
          value={lead.status}
          disabled={busy}
          onChange={(e) => onMove(e.target.value as LeadStatus)}
          className="w-full rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink-soft hover:border-ink"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s} disabled={s === 'won' && !lead.project_id}>
              {s === lead.status ? `In: ${LEAD_STATUS[s].label}` : `Move to ${LEAD_STATUS[s].label}`}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}
