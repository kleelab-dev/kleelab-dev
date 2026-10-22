'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useCurrentUser } from '@/components/app/AppShell';
import { errorText, formatDate, formatMinutes, staffLabel } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { StaffMember, TimeSheet } from '@/types/api';

const DAY_NAME = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The Monday of the week `offset` weeks from this one. */
function monday(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}

function weekDays(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return iso(d);
  });
}

/** A week of the team's time, by day and by project. Log time from a project page. */
export function TimeView() {
  const me = useCurrentUser();
  const [offset, setOffset] = useState(0);
  const [who, setWho] = useState<string>(me.id);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [sheet, setSheet] = useState<TimeSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const days = weekDays(monday(offset));
  const start = days[0];
  const end = days[6];

  useEffect(() => {
    let active = true;
    apiService
      .adminStaff()
      .then((list) => active && setStaff(list))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiService
      .adminTimesheet(start, end, who || null)
      .then((value) => {
        if (!active) return;
        setSheet(value);
        setError(null);
      })
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [start, end, who, attempt]);

  // Only show the sheet for the week and person asked for, not the last one loaded.
  const current = sheet && sheet.start === start && sheet.end === end ? sheet : null;
  const byDay = new Map(days.map((d) => [d, 0]));
  for (const e of current?.entries ?? []) byDay.set(e.worked_on, (byDay.get(e.worked_on) ?? 0) + e.minutes);
  const busiest = Math.max(60, ...byDay.values());
  const today = iso(new Date());

  return (
    <div>
      <p className="tag">team</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Time</h1>
      <p className="mt-3 text-muted">What the team logged each week. Log time from a project page.</p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" aria-label="Week before" onClick={() => setOffset((n) => n - 1)}>
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <p className="min-w-[13rem] text-center text-sm font-semibold">
          {formatDate(start)} to {formatDate(end)}
        </p>
        <Button type="button" variant="secondary" size="sm" aria-label="Week after" disabled={offset >= 0} onClick={() => setOffset((n) => n + 1)}>
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
        {offset !== 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOffset(0)}>This week</Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted">Showing</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className="field w-auto py-1.5 text-sm">
            <option value={me.id}>You</option>
            <option value="">Everyone</option>
            {staff.filter((m) => m.id !== me.id).map((m) => (
              <option key={m.id} value={m.id}>{staffLabel(m, staff)}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} className="mt-6" />}

      {!current ? (
        !error && <Skeleton rows={3} className="mt-6" />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="card p-5 sm:p-6">
            <div className="flex items-baseline justify-between">
              <p className="tag">this week</p>
              <p className="font-display text-3xl font-extrabold">{formatMinutes(current.total_minutes)}</p>
            </div>
            <ol className="mt-5 grid grid-cols-7 gap-2" aria-label="Time by day">
              {days.map((day) => {
                const minutes = byDay.get(day) ?? 0;
                return (
                  <li key={day} className="grid justify-items-center gap-1.5 text-center">
                    <div className="flex h-28 w-full items-end rounded-lg border-[1.5px] border-line bg-paper p-1">
                      <div
                        className={clsx('w-full rounded', minutes ? 'bg-cobalt' : 'bg-transparent')}
                        style={{ height: `${(minutes / busiest) * 100}%` }}
                      />
                    </div>
                    <span className={clsx('font-mono text-[10px] uppercase tracking-label', day === today ? 'text-cobalt' : 'text-muted')}>
                      {DAY_NAME.format(new Date(`${day}T00:00:00`))}
                    </span>
                    <span className="text-xs font-semibold">{minutes ? formatMinutes(minutes) : '–'}</span>
                  </li>
                );
              })}
            </ol>

            {current.entries.length === 0 ? (
              <EmptyState title="Nothing logged this week" className="mt-6 border-line">
                Open a project and use the Time panel to log what you worked on.
              </EmptyState>
            ) : (
              <ul className="mt-6 divide-y divide-line border-t border-line">
                {[...current.entries].reverse().map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <span className="w-14 shrink-0 font-semibold">{formatMinutes(entry.minutes)}</span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/projects/${entry.project_id}`} className="font-semibold no-underline hover:text-cobalt">
                        {entry.project_title}
                      </Link>
                      <span className="block text-xs text-muted">
                        {formatDate(entry.worked_on)}
                        {who === '' && ` · ${entry.mine ? 'You' : entry.user_name ?? 'Former team member'}`}
                        {entry.stage_name ? ` · ${entry.stage_name}` : ''}
                      </span>
                      {entry.note && <span className="block break-words">{entry.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card self-start p-5 sm:p-6">
            <p className="tag">by project</p>
            {current.by_project.length ? (
              <ul className="mt-3 grid gap-2 text-sm">
                {current.by_project.map((t) => (
                  <li key={t.id ?? t.name} className="flex justify-between gap-3">
                    <Link href={`/projects/${t.id}`} className="truncate no-underline hover:text-cobalt">{t.name}</Link>
                    <span className="shrink-0 font-semibold">{formatMinutes(t.minutes)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No projects this week.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
