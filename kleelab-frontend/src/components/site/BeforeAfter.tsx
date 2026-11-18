import { CheckIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

const THREAD = [
  { subject: 'Any update?', offset: 'ml-0 rotate-[-2deg]' },
  { subject: 'Re: Re: Fwd: new homepage', offset: 'ml-4 rotate-[1.5deg]' },
  { subject: 'Re: which version is this?', offset: 'ml-1 rotate-[-1deg]' },
  { subject: 'Fwd: Fwd: photos (final v3)', offset: 'ml-6 rotate-[2deg]' },
];

const STAGES = [
  { name: 'Planning', state: 'done' },
  { name: 'Design', state: 'done' },
  { name: 'Build', state: 'now' },
  { name: 'Testing', state: 'next' },
] as const;

/** The same project without a dashboard (an email pile) and with one (a tidy stage list). */
export function BeforeAfter({ className }: { className?: string }) {
  return (
    <figure aria-label="Example: a project without and with a dashboard" className={clsx('relative', className)}>
      <div aria-hidden className="relative grid gap-6 pt-8 sm:grid-cols-2">
        {/* One dimension line over both panels, like a measurement across a drawing. */}
        <div className="dim top-0">same project</div>
        <div className="bg-graph rounded-2xl border-[1.5px] border-dashed border-ink p-5">
          <p className="font-mono text-[10px] uppercase tracking-label text-muted">Without a dashboard</p>
          <div className="mt-4 grid">
            {THREAD.map((mail, index) => (
              <div
                key={mail.subject}
                className={clsx('relative -mt-2 w-11/12 rounded-lg border border-line bg-white px-3 py-2 first:mt-0', mail.offset)}
                style={{ zIndex: index }}
              >
                <p className="truncate text-xs font-semibold text-muted">{mail.subject}</p>
                <span className="mt-1.5 block h-1.5 w-3/4 rounded-full bg-line" />
              </div>
            ))}
          </div>
        </div>

        <div className="relative rounded-2xl border-[1.5px] border-ink bg-white p-5 shadow-block-sm">
          <p className="font-mono text-[10px] uppercase tracking-label text-cobalt">With KleeLab · example</p>
          <ul className="mt-4 grid gap-2">
            {STAGES.map((stage) => (
              <li key={stage.name} className="flex items-center gap-3 text-sm">
                <span
                  className={clsx(
                    'grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px]',
                    stage.state === 'done' && 'border-ink bg-sun',
                    stage.state === 'now' && 'border-cobalt bg-cobalt',
                    stage.state === 'next' && 'border-line',
                  )}
                >
                  {stage.state === 'done' && <CheckIcon className="h-3 w-3" />}
                </span>
                <span className={clsx('flex-1', stage.state === 'next' && 'text-muted')}>{stage.name}</span>
                {stage.state === 'now' && <span className="font-mono text-[10px] uppercase tracking-label text-cobalt">This week</span>}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl border-[1.5px] border-ink bg-sun-soft p-3">
            <p className="font-mono text-[10px] uppercase tracking-label">Waiting for you</p>
            <p className="mt-1 text-sm font-semibold">Approve the homepage design</p>
            <span className="mt-2 inline-block rounded-full bg-cobalt px-3 py-1 text-xs font-semibold text-white">Approve</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
