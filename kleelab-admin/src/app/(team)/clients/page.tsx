'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Pill } from '@/components/project/Pill';
import { errorText, formatTotals, timeAgo } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { ClientSummary } from '@/types/api';

type Filter = 'all' | 'owing' | 'never' | 'off';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'owing', label: 'Owe money' },
  { value: 'never', label: 'Never signed in' },
  { value: 'off', label: 'Switched off' },
];

function matches(client: ClientSummary, filter: Filter): boolean {
  if (filter === 'owing') return client.outstanding.length > 0;
  if (filter === 'never') return client.is_active && !client.last_sign_in;
  if (filter === 'off') return !client.is_active;
  return true;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    apiService
      .adminClients()
      .then((list) => active && setClients(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const shown =
    clients?.filter((c) => matches(c, filter) && (!needle || [c.name, c.email].some((v) => v?.toLowerCase().includes(needle)))) ?? [];

  return (
    <div>
      <p className="tag">team</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Clients</h1>
      <p className="mt-3 text-muted">Everyone we have built for, or are building for now. A client is added when you start a project for them.</p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show clients">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={clsx('rounded-full px-3.5 py-1.5 text-sm', filter === value ? 'bg-ink text-paper' : 'border-[1.5px] border-line bg-white hover:border-ink')}
            >
              {label}
              {clients && <span className="ml-1.5 opacity-60">{clients.filter((c) => matches(c, value)).length}</span>}
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-72">
          <span className="sr-only">Search clients</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email" className="field py-2 pl-9 text-sm" />
        </label>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger md:col-span-2">{error}</p>}
        {!error && clients === null && <p className="font-mono text-[11px] uppercase tracking-label text-muted">Loading…</p>}
        {clients && shown.length === 0 && <p className="text-sm text-muted">{needle ? 'No clients match.' : 'Nobody here.'}</p>}
        {shown.map((client) => (
          <Link key={client.id} href={`/clients/${client.id}`} className="card group block p-5 no-underline transition-shadow hover:shadow-block">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate font-semibold text-ink group-hover:text-cobalt">{client.name || client.email}</h2>
              {!client.is_active && <Pill tone="bg-line text-muted">Switched off</Pill>}
              {client.is_active && !client.last_sign_in && <Pill tone="bg-sun-soft text-ink">Never signed in</Pill>}
            </div>
            {client.name && <p className="truncate text-sm text-muted">{client.email}</p>}
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-label text-muted">Projects</dt>
                <dd className="mt-0.5 text-ink">
                  {client.project_count}
                  {client.active_projects > 0 && <span className="text-muted"> · {client.active_projects} live</span>}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-mono text-[10px] uppercase tracking-label text-muted">Billed</dt>
                <dd className="mt-0.5 truncate text-ink">{client.billed.length ? formatTotals(client.billed) : '—'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-mono text-[10px] uppercase tracking-label text-muted">Owes</dt>
                <dd className={clsx('mt-0.5 truncate', client.outstanding.length ? 'font-semibold text-danger' : 'text-ink')}>
                  {client.outstanding.length ? formatTotals(client.outstanding) : 'Nothing'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted">
              {client.last_activity ? `Last project change ${timeAgo(client.last_activity)}` : 'No activity yet'}
              {client.last_sign_in && ` · signed in ${timeAgo(client.last_sign_in)}`}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
