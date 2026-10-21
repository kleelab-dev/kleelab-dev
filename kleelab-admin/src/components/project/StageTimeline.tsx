import { clsx } from 'clsx';
import { CheckIcon } from '@heroicons/react/24/solid';
import type { Stage } from '@/types/api';
import { formatDate, STAGE_STATUS, stageLabel } from './format';
import { Pill } from './Pill';

/** The project's steps, top to bottom, with the current one called out. */
export function StageTimeline({ stages, renderControls, team = false }: { stages: Stage[]; team?: boolean; renderControls?: (stage: Stage) => React.ReactNode }) {
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  return (
    <ol className="relative">
      {ordered.map((stage, index) => {
        const status = STAGE_STATUS[stage.status];
        const live = stage.status === 'in_progress' || stage.status === 'waiting_on_client';
        return (
          <li key={stage.id} className="relative flex gap-4 pb-6 last:pb-0">
            {index < ordered.length - 1 && (
              <span aria-hidden className={clsx('absolute left-[15px] top-8 h-[calc(100%-2rem)] w-[1.5px]', stage.status === 'done' ? 'bg-ink' : 'bg-line')} />
            )}
            <span
              className={clsx(
                'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] font-mono text-xs font-semibold',
                status.tone,
                live && 'shadow-block-sm',
              )}
            >
              {stage.status === 'done' ? <CheckIcon className="h-4 w-4" /> : String(stage.position + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={clsx('font-semibold', stage.status === 'upcoming' && 'text-muted')}>{stage.name}</h3>
                {stage.status !== 'upcoming' && <Pill tone={status.tone.replace(/border-\S+/, '')}>{stageLabel(stage.status, team)}</Pill>}
              </div>
              {stage.description && <p className="mt-1 text-sm leading-6 text-muted">{stage.description}</p>}
              <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-muted">
                {stage.status === 'done' && stage.completed_at
                  ? `Finished ${formatDate(stage.completed_at)}`
                  : stage.due_date
                    ? `Planned for ${formatDate(stage.due_date)}`
                    : 'Date not set yet'}
              </p>
              {renderControls && <div className="mt-3">{renderControls(stage)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
