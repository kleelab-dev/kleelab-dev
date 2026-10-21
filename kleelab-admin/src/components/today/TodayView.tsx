'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ArrowRightIcon, ExclamationTriangleIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline';
import { buttonClass } from '@/components/ui/Button';
import { useCurrentUser } from '@/components/app/AppShell';
import { Panel, Pill } from '@/components/project/Pill';
import { ATTENTION, attentionHref, errorText, formatTotals, timeAgo } from '@/components/project/format';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useWhileVisible } from '@/lib/useWhileVisible';
import { apiService } from '@/services/api';
import type { AdminStats, AttentionItem } from '@/types/api';

const LONG_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The team's start page: the numbers that matter and what is waiting on someone. */
export function TodayView() {
  const user = useCurrentUser();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminStats()
      .then((value) => active && setStats(value))
      .catch((reason) => active && setError(errorText(reason)));
    apiService
      .adminOverview()
      .then((list) => active && setItems(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  // Keep the numbers and the list current while the page is open. Silent: no
  // skeleton, and a failed check keeps what is on screen until the next one.
  useWhileVisible(
    () => {
      apiService.adminStats().then(setStats).catch(() => undefined);
      apiService.adminOverview().then(setItems).catch(() => undefined);
    },
    30_000,
    !error,
  );

  const firstName = user.full_name?.split(' ')[0] || user.email.split('@')[0];
  const list = items ?? [];
  const visible = showAll ? list : list.slice(0, 8);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tag">{LONG_DATE.format(new Date())}</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-3 text-muted">
            {items === null
              ? 'Checking what needs you…'
              : list.length
                ? `${list.length} ${list.length === 1 ? 'thing needs' : 'things need'} the team today.`
                : 'Nothing is waiting on the team. Good time to get ahead.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/leads" className={buttonClass('secondary')}>Enquiries</Link>
          <Link href="/projects?new=1" className={buttonClass('primary')}>New project</Link>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => { setError(null); setStats(null); setItems(null); setAttempt((n) => n + 1); }} className="mt-8" />}

      {!user.two_step_enabled && (
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-ink bg-sun-soft p-4 text-sm">
          <ShieldExclamationIcon className="h-6 w-6 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <strong>Turn on two-step sign-in.</strong> Your account opens every client project and invoice; a code from your phone means a
            leaked password is not enough to get in.
          </p>
          <Link href="/account" className={buttonClass('secondary', 'sm')}>Set it up</Link>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          href="/leads"
          label="New enquiries"
          value={stats?.new_enquiries}
          note={stats && `${stats.enquiries_this_month} this month${stats.follow_ups_due ? ` · ${stats.follow_ups_due} to follow up` : ''}`}
          highlight={Boolean(stats?.new_enquiries)}
        />
        <Stat
          href="/projects"
          label="Projects in progress"
          value={stats?.active_projects}
          note={stats && (stats.waiting_on_client ? `${stats.waiting_on_client} waiting on the client` : stats.paused_projects ? `${stats.paused_projects} paused` : 'None waiting on clients')}
        />
        <Stat
          href="/money"
          label="Not paid yet"
          value={stats && formatTotals(stats.unpaid)}
          note={stats && (stats.overdue.length ? `${formatTotals(stats.overdue)} overdue` : `${invoiceCount(stats.unpaid)} open`)}
          warning={Boolean(stats?.overdue.length)}
        />
        <Stat
          href="/money?show=paid"
          label="Paid this month"
          value={stats && formatTotals(stats.paid_this_month)}
          note={stats && invoiceCount(stats.paid_this_month)}
        />
      </div>

      <Panel tag={items === null ? 'checking' : list.length ? `${list.length} waiting` : 'all clear'} title="Needs attention" className="mt-8">
        {items === null ? (
          error ? <p className="text-sm text-muted">Could not check right now.</p> : <Skeleton rows={3} card={false} />
        ) : list.length === 0 ? (
          <EmptyState title="All clear">Nothing is waiting on the team right now.</EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {visible.map((item, index) => {
                const kind = ATTENTION[item.kind] ?? { label: item.kind, tone: 'bg-line text-ink' };
                return (
                  <li key={`${item.kind}-${item.project_id ?? item.lead_id}-${index}`}>
                    <Link href={attentionHref(item)} className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-3 no-underline hover:bg-paper">
                      <Pill tone={kind.tone}>{kind.label}</Pill>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-medium text-ink">{item.text}</span>
                        {item.project_title && <span className="text-muted"> · {item.project_title}</span>}
                      </span>
                      <span className="text-xs text-muted">
                        {item.owner_name ? `${item.owner_name} · ` : ''}
                        {timeAgo(item.since)}
                      </span>
                      <ArrowRightIcon className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {list.length > 8 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm font-semibold text-cobalt">
                {showAll ? 'Show fewer' : `Show all ${list.length}`}
              </button>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  href,
  highlight,
  warning,
}: {
  label: string;
  value: number | string | null | undefined;
  note?: string | null;
  href?: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  const body = (
    <>
      <p className="font-mono text-[11px] uppercase tracking-label text-muted">{label}</p>
      <p className="mt-2 truncate font-display text-3xl font-extrabold tracking-tight text-ink">
        {value === undefined || value === null ? <span className="text-line">—</span> : value}
      </p>
      {note && (
        <p className={clsx('mt-1 flex items-center gap-1 text-xs', warning ? 'font-medium text-danger' : 'text-muted')}>
          {warning && <ExclamationTriangleIcon className="h-3.5 w-3.5" aria-hidden />}
          {note}
        </p>
      )}
    </>
  );
  const className = clsx('card block p-5 no-underline', highlight && 'shadow-block', href && 'transition-transform hover:-translate-y-0.5');
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function invoiceCount(totals: AdminStats['unpaid']): string {
  const n = totals.reduce((sum, t) => sum + t.count, 0);
  return `${n} ${n === 1 ? 'invoice' : 'invoices'}`;
}
