'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { errorText } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { ActivityEvent, ProjectSummary, TeamMember } from '@/types/api';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return DAY.format(date);
}

/** A colour per kind of event, so security changes stand out in a long list. */
function tone(event: ActivityEvent): string {
  if (event.by_client) return 'bg-mint border-ink';
  const kind = event.action.split('.')[0];
  if (event.action === 'auth.sign_in_failed' || event.action === 'auth.code_failed' || event.action === 'auth.locked') return 'bg-danger border-danger';
  if (kind === 'auth' || kind === 'two_step' || kind === 'team') return 'bg-ink border-ink';
  if (kind === 'invoice') return 'bg-sun border-ink';
  return 'bg-cobalt border-cobalt';
}

export function ActivityView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const person = params.get('person') ?? '';
  const project = params.get('project') ?? '';
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    apiService.adminTeam().then(setTeam).catch(() => undefined);
    apiService.adminProjects().then(setProjects).catch(() => undefined);
  }, []);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminActivity({ actor_id: person || undefined, project_id: project || undefined })
      .then((page) => {
        if (!active) return;
        setEvents(page.events);
        setNext(page.next_before);
      })
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [person, project, attempt]);

  function load() {
    setEvents(null);
    setError(null);
    setAttempt((n) => n + 1);
  }

  async function loadMore() {
    if (!next) return;
    setMore(true);
    try {
      const page = await apiService.adminActivity({ actor_id: person || undefined, project_id: project || undefined, before: next });
      setEvents((list) => [...(list ?? []), ...page.events]);
      setNext(page.next_before);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setMore(false);
    }
  }

  function setFilter(key: 'person' | 'project', value: string) {
    setEvents(null);
    setError(null);
    const nextParams = new URLSearchParams(params.toString());
    if (value) nextParams.set(key, value);
    else nextParams.delete(key);
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // Group by the viewer's calendar day, keeping the newest-first order.
  const days: { label: string; events: ActivityEvent[] }[] = [];
  for (const event of events ?? []) {
    const date = new Date(event.created_at);
    const label = dayLabel(date);
    const last = days[days.length - 1];
    if (last && last.label === label) last.events.push(event);
    else days.push({ label, events: [event] });
  }

  const filtered = Boolean(person || project);

  return (
    <div>
      <p className="tag">team</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Activity</h1>
      <p className="mt-3 text-muted">Who changed what, and when. Clients’ messages and approvals show here too.</p>

      <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="sm:w-60">
          <label htmlFor="filter-person" className="label">Person</label>
          <select id="filter-person" value={person} onChange={(e) => setFilter('person', e.target.value)} className="field py-2 text-sm">
            <option value="">Everyone</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
                {m.is_you ? ' (you)' : ''}
                {!m.is_active ? ' (switched off)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-72">
          <label htmlFor="filter-project" className="label">Project</label>
          <select id="filter-project" value={project} onChange={(e) => setFilter('project', e.target.value)} className="field py-2 text-sm">
            <option value="">All projects and the rest</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference} · {p.title}
              </option>
            ))}
          </select>
        </div>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => {
              setEvents(null);
              setError(null);
              router.replace(pathname, { scroll: false });
            }} className="justify-self-start">
            Clear filters
          </Button>
        )}
      </div>

      <div className="mt-8">
        {error && <ErrorState message={error} onRetry={events ? loadMore : load} className="mb-6" />}
        {!error && events === null && <Skeleton rows={4} card={false} className="card p-5" />}
        {events && events.length === 0 && (
          <EmptyState title={filtered ? 'Nothing matches' : 'Nothing has happened yet'}>
            {filtered ? 'Try another person or project.' : 'Changes to projects, invoices, enquiries and the team will show here.'}
          </EmptyState>
        )}
        <div className="grid gap-8">
          {days.map((day) => (
            <section key={day.label} aria-labelledby={`day-${day.label}`}>
              <h2 id={`day-${day.label}`} className="font-mono text-[11px] uppercase tracking-label text-muted">{day.label}</h2>
              <ol className="card mt-3 divide-y-[1.5px] divide-line">
                {day.events.map((event) => (
                  <li key={event.id} className="flex gap-3 px-4 py-3 sm:px-5">
                    <span className={clsx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px]', tone(event))} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-semibold">{event.actor_name || 'Someone removed'}</span>
                        {event.by_client && <span className="text-muted"> (client)</span>} <span className="break-words">{lowerFirst(event.summary)}</span>
                      </p>
                      {event.project_id && (
                        <Link href={`/projects/${event.project_id}`} className="mt-0.5 inline-block max-w-full truncate text-xs text-cobalt">
                          {event.project_reference} · {event.project_title}
                        </Link>
                      )}
                    </div>
                    <time dateTime={event.created_at} className="shrink-0 font-mono text-[11px] text-muted">
                      {TIME.format(new Date(event.created_at))}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        {next && events && (
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={loadMore} disabled={more}>{more ? 'Loading…' : 'Show older'}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Summaries are written as sentences ("Moved…"); after a name they read better lower-cased. */
function lowerFirst(text: string): string {
  return text && /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}
