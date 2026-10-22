'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { CalendarDaysIcon, ChatBubbleLeftRightIcon, ListBulletIcon, MagnifyingGlassIcon, ViewColumnsIcon } from '@heroicons/react/24/outline';
import { buttonClass } from '@/components/ui/Button';
import { Pill } from '@/components/project/Pill';
import { budgetLabel, errorText, followUpDue, formatDate, formatDateTime, LEAD_STATUS, leadIsOpen, leadSource } from '@/components/project/format';
import { PipelineBoard } from '@/components/leads/PipelineBoard';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import type { Lead, LeadStatus } from '@/types/api';

type Filter = LeadStatus | 'follow_up' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'new', label: LEAD_STATUS.new.label },
  { value: 'follow_up', label: 'Follow-up due' },
  { value: 'contacted', label: LEAD_STATUS.contacted.label },
  { value: 'call', label: LEAD_STATUS.call.label },
  { value: 'proposal', label: LEAD_STATUS.proposal.label },
  { value: 'won', label: LEAD_STATUS.won.label },
  { value: 'lost', label: LEAD_STATUS.lost.label },
  { value: 'all', label: 'All' },
];

function matches(lead: Lead, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'follow_up') return followUpDue(lead);
  return lead.status === filter;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('new');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminLeads()
      .then((list) => active && setLeads(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  const needle = query.trim().toLowerCase();
  const found = (l: Lead) => !needle || [l.name, l.email, l.company, l.message, l.interest].some((v) => v?.toLowerCase().includes(needle));
  const shown = leads?.filter((l) => matches(l, filter) && found(l)) ?? [];
  const board = view === 'board';

  return (
    <div>
      <p className="tag">team</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Enquiries</h1>
      <p className="mt-3 text-muted">People who wrote to us through the contact form, the chat or by booking a call. Open one to reply, add notes or set a follow-up.</p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="mr-2 inline-flex rounded-full border-[1.5px] border-ink bg-white p-0.5" role="group" aria-label="Layout">
          {([
            { value: 'board', label: 'Board', Icon: ViewColumnsIcon },
            { value: 'list', label: 'List', Icon: ListBulletIcon },
          ] as const).map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm', view === value ? 'bg-ink text-paper' : 'text-ink hover:bg-paper')}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        {!board && <div className="flex flex-wrap gap-2" role="group" aria-label="Show enquiries">
          {FILTERS.map(({ value, label }) => {
            const count = leads?.filter((l) => matches(l, value)).length;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={clsx('rounded-full px-3.5 py-1.5 text-sm', filter === value ? 'bg-ink text-paper' : 'border-[1.5px] border-line bg-white hover:border-ink')}
              >
                {label}
                {leads && value !== 'all' && <span className="ml-1.5 opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>}
        <label className="relative ml-auto w-full sm:w-72">
          <span className="sr-only">Search enquiries</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or words"
            className="field py-2 pl-9 text-sm"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-4">
        {error && <ErrorState message={error} onRetry={() => { setError(null); setLeads(null); setAttempt((n) => n + 1); }} />}
        {!error && leads === null && <Skeleton rows={3} />}
        {leads && board && (
          <PipelineBoard
            leads={leads.filter(found)}
            onChange={(next) => setLeads((list) => list?.map((l) => (l.id === next.id ? { ...l, ...next } : l)) ?? null)}
          />
        )}
        {leads && !board && shown.length === 0 && (
          <EmptyState title={needle ? 'No enquiries match' : leads.length ? 'Nothing in this list' : 'No enquiries yet'}>
            {needle ? 'Try a name, an email or a word from their message.' : leads.length ? 'Pick another filter above.' : 'Messages from the contact form and the chat on the KleeLab site land here.'}
          </EmptyState>
        )}
        {!board && shown.map((lead) => {
          const budget = budgetLabel(lead.budget);
          const due = followUpDue(lead);
          return (
            <article key={lead.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={LEAD_STATUS[lead.status].tone}>{LEAD_STATUS[lead.status].label}</Pill>
                {lead.follow_up_on && leadIsOpen(lead.status) && (
                  <span className={clsx('inline-flex items-center gap-1 text-xs', due ? 'font-semibold text-danger' : 'text-muted')}>
                    <CalendarDaysIcon className="h-3.5 w-3.5" aria-hidden />
                    {due ? 'Follow up now' : `Follow up ${formatDate(lead.follow_up_on)}`}
                  </span>
                )}
                <span className="text-xs text-muted">{leadSource(lead.source)}</span>
                <span className="ml-auto text-xs text-muted">{formatDateTime(lead.created_at)}</span>
              </div>
              <h2 className="mt-2 font-semibold">
                <Link href={`/leads/${lead.id}`} className="text-ink no-underline hover:text-cobalt">
                  {lead.name || 'No name given'}
                  {lead.company && <span className="font-normal text-muted"> · {lead.company}</span>}
                </Link>
              </h2>
              <p className="text-sm text-muted">{lead.email}</p>
              {(lead.interest || budget) && (
                <p className="mt-2 text-sm text-muted">
                  {lead.interest && <>Wants: <span className="text-ink">{lead.interest}</span></>}
                  {lead.interest && budget && ' · '}
                  {budget && <>Budget: <span className="text-ink">{budget}</span></>}
                </p>
              )}
              {lead.message && <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm leading-6 text-ink-soft">{lead.message}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href={`/leads/${lead.id}`} className={buttonClass('primary', 'sm')}>
                  <ChatBubbleLeftRightIcon className="h-4 w-4" aria-hidden />
                  Open and reply
                </Link>
                {lead.project_id ? (
                  <Link href={`/projects/${lead.project_id}`} className={buttonClass('secondary', 'sm')}>
                    Open their project
                  </Link>
                ) : (
                  lead.status !== 'lost' && (
                    <Link href={`/projects?lead=${lead.id}`} className={buttonClass('secondary', 'sm')}>
                      Start a project
                    </Link>
                  )
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
