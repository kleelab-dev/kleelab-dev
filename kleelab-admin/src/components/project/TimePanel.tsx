'use client';

import { useEffect, useState } from 'react';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import type { ProjectDetail, ProjectTime, TimeEntry, TimeEntryInput } from '@/types/api';
import { errorText, formatDate, formatMinutes, parseDuration, todayISO } from './format';

// Entries shown before "Show all".
const SHOWN = 6;

/**
 * The time the team spends on a project. Only the team sees it; when the
 * project has a care plan with hours, time logged this period counts against them.
 */
export function TimePanel({ project, onLogged }: { project: ProjectDetail; onLogged: () => void }) {
  const [time, setTime] = useState<ProjectTime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let active = true;
    apiService
      .adminProjectTime(project.id)
      .then((value) => active && setTime(value))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [project.id, attempt]);

  async function apply(work: () => Promise<ProjectTime>) {
    setError(null);
    try {
      setTime(await work());
      setEditing(null);
      onLogged();
      return true;
    } catch (reason) {
      setError(errorText(reason));
      return false;
    }
  }

  if (!time) {
    return error ? (
      <ErrorState message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} />
    ) : (
      <Skeleton rows={2} card={false} />
    );
  }

  const entries = all ? time.entries : time.entries.slice(0, SHOWN);
  return (
    <div className="grid gap-4">
      <EntryForm
        key={editing?.id ?? 'new'}
        project={project}
        entry={editing}
        onCancel={editing ? () => setEditing(null) : undefined}
        onSubmit={(input) =>
          apply(() => (editing ? apiService.adminEditTime(editing.id, input) : apiService.adminLogTime(project.id, input)))
        }
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {time.entries.length > 0 ? (
        <>
          <div className="grid gap-2 border-t border-line pt-4">
            <p className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-label text-muted">Total</span>
              <span className="font-display text-2xl font-extrabold">{formatMinutes(time.total_minutes)}</span>
            </p>
            {time.by_person.length > 1 && <Breakdown label="By person" totals={time.by_person} />}
            {time.by_stage.length > 1 && <Breakdown label="By step" totals={time.by_stage} />}
          </div>
          <ul className="grid gap-1.5">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 rounded-xl border-[1.5px] border-line bg-white p-2.5 text-sm">
                <span className="w-14 shrink-0 font-semibold">{formatMinutes(entry.minutes)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">
                    {formatDate(entry.worked_on)} · {entry.mine ? 'You' : entry.user_name ?? 'Former team member'}
                    {entry.stage_name ? ` · ${entry.stage_name}` : ''}
                  </span>
                  {entry.note && <span className="block break-words">{entry.note}</span>}
                </span>
                {entry.mine && (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="Change this entry"
                      title="Change"
                      onClick={() => setEditing(entry)}
                      className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-line bg-white hover:border-ink"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove this entry"
                      title="Remove"
                      onClick={() => {
                        if (window.confirm(`Remove ${formatMinutes(entry.minutes)} logged on ${formatDate(entry.worked_on)}?`)) {
                          apply(() => apiService.adminDeleteTime(entry.id));
                        }
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-line bg-white hover:border-danger hover:text-danger"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {time.entries.length > SHOWN && (
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${time.entries.length}`}
            </Button>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">No time logged yet. Only the team sees this.</p>
      )}
    </div>
  );
}

function Breakdown({ label, totals }: { label: string; totals: { id: string | null; name: string; minutes: number }[] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-label text-muted">{label}</p>
      <ul className="mt-1 grid gap-0.5 text-sm">
        {totals.map((t) => (
          <li key={t.id ?? t.name} className="flex justify-between gap-2">
            <span className="truncate">{t.name}</span>
            <span className="text-muted">{formatMinutes(t.minutes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryForm({
  project,
  entry,
  onCancel,
  onSubmit,
}: {
  project: ProjectDetail;
  entry: TimeEntry | null;
  onCancel?: () => void;
  onSubmit: (input: TimeEntryInput) => Promise<boolean>;
}) {
  const current = project.stages.find((s) => s.status === 'in_progress');
  const [spent, setSpent] = useState(entry ? formatMinutes(entry.minutes) : '');
  const [day, setDay] = useState(entry?.worked_on ?? todayISO());
  const [stageId, setStageId] = useState(entry ? entry.stage_id ?? '' : current?.id ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const minutes = parseDuration(spent);
    if (!minutes || minutes > 24 * 60) {
      setProblem('Write the time as 1.5, 1:30, 90m or 1h 30m, up to 24 hours.');
      return;
    }
    setBusy(true);
    const ok = await onSubmit({ worked_on: day, minutes, stage_id: stageId || null, note: note.trim() || null });
    setBusy(false);
    if (ok && !entry) {
      setSpent('');
      setNote('');
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="time-spent" className="label">Time spent</label>
          <input
            id="time-spent"
            value={spent}
            onChange={(e) => {
              setProblem(null);
              setSpent(e.target.value);
            }}
            className="field text-sm"
            placeholder="1h 30m"
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label htmlFor="time-day" className="label">Day</label>
          <input id="time-day" type="date" max={todayISO(1)} value={day} onChange={(e) => setDay(e.target.value)} className="field text-sm" required />
        </div>
      </div>
      <div>
        <label htmlFor="time-stage" className="label">Step</label>
        <select id="time-stage" value={stageId} onChange={(e) => setStageId(e.target.value)} className="field text-sm">
          <option value="">Not for a step</option>
          {project.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="time-note" className="label">What you did</label>
        <input id="time-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="field text-sm" placeholder="Optional" />
      </div>
      {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : entry ? 'Save' : 'Log time'}</Button>
        {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>}
      </div>
    </form>
  );
}
