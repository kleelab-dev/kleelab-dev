'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { buttonClass } from '@/components/ui/Button';
import { Pill } from '@/components/project/Pill';
import { budgetLabel, errorText, formatDateTime, LEAD_STATUS, leadSource } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { Lead, LeadStatus } from '@/types/api';

const ACTIONS: Record<LeadStatus, string> = {
  new: 'Mark as new',
  contacted: 'We replied',
  won: 'Became a client',
  lost: 'Not going ahead',
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadStatus | 'all'>('new');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    apiService
      .adminLeads()
      .then((list) => active && setLeads(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, []);

  async function change(lead: Lead, status: LeadStatus) {
    try {
      const saved = await apiService.adminUpdateLead(lead.id, status);
      setLeads((list) => list?.map((l) => (l.id === saved.id ? { ...saved, project_id: saved.project_id ?? l.project_id } : l)) ?? null);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  const needle = query.trim().toLowerCase();
  const shown =
    leads?.filter((l) => {
      if (filter !== 'all' && l.status !== filter) return false;
      if (!needle) return true;
      return [l.name, l.email, l.company, l.message, l.interest].some((v) => v?.toLowerCase().includes(needle));
    }) ?? [];

  return (
    <div>
      <p className="tag">team</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Enquiries</h1>
      <p className="mt-3 text-muted">People who wrote to us through the contact form or the chat on the site.</p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show enquiries that are">
          {(['new', 'contacted', 'won', 'lost', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={clsx('rounded-full px-3.5 py-1.5 text-sm', filter === value ? 'bg-ink text-paper' : 'border-[1.5px] border-line bg-white hover:border-ink')}
            >
              {value === 'all' ? 'All' : LEAD_STATUS[value].label}
              {leads && value !== 'all' && <span className="ml-1.5 opacity-60">{leads.filter((l) => l.status === value).length}</span>}
            </button>
          ))}
        </div>
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
        {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
        {!error && leads === null && <p className="font-mono text-[11px] uppercase tracking-label text-muted">Loading…</p>}
        {leads && shown.length === 0 && <p className="text-sm text-muted">{needle ? 'No enquiries match.' : 'Nothing here.'}</p>}
        {shown.map((lead) => {
          const budget = budgetLabel(lead.budget);
          return (
            <article key={lead.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={LEAD_STATUS[lead.status].tone}>{LEAD_STATUS[lead.status].label}</Pill>
                <span className="text-xs text-muted">{leadSource(lead.source)}</span>
                <span className="ml-auto text-xs text-muted">{formatDateTime(lead.created_at)}</span>
              </div>
              <h2 className="mt-2 font-semibold">
                {lead.name || 'No name given'}
                {lead.company && <span className="font-normal text-muted"> · {lead.company}</span>}
              </h2>
              <a href={`mailto:${lead.email}`} className="text-sm text-cobalt">{lead.email}</a>
              {(lead.interest || budget) && (
                <p className="mt-2 text-sm text-muted">
                  {lead.interest && <>Wants: <span className="text-ink">{lead.interest}</span></>}
                  {lead.interest && budget && ' · '}
                  {budget && <>Budget: <span className="text-ink">{budget}</span></>}
                </p>
              )}
              {lead.message && <p className="mt-3 max-h-60 overflow-auto whitespace-pre-line rounded-xl bg-paper p-3 text-sm leading-6 text-ink-soft">{lead.message}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {lead.project_id ? (
                  <Link href={`/projects/${lead.project_id}`} className={buttonClass('secondary', 'sm')}>
                    Open their project
                  </Link>
                ) : (
                  lead.status !== 'lost' && (
                    <Link href={`/?lead=${lead.id}`} className={buttonClass('primary', 'sm')}>
                      Start a project
                    </Link>
                  )
                )}
                {(Object.keys(ACTIONS) as LeadStatus[])
                  .filter((s) => s !== lead.status && !(s === 'won' && !lead.project_id))
                  .map((s) => (
                    <button key={s} type="button" onClick={() => change(lead, s)} className="rounded-full border-[1.5px] border-line px-3 py-1 text-xs hover:border-ink">
                      {ACTIONS[s]}
                    </button>
                  ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
