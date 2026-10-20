import { clsx } from 'clsx';

const STEPS = [
  { name: 'Planning', note: 'approved', state: 'done' },
  { name: 'Design', note: 'approved', state: 'done' },
  { name: 'Build', note: 'working on it', state: 'now' },
  { name: 'Testing', note: 'next', state: 'todo' },
  { name: 'Going live', note: 'planned', state: 'todo' },
  { name: 'Hand-over', note: 'planned', state: 'todo' },
] as const;

/**
 * An illustration of the client dashboard for the home page.
 *
 * Labelled as an example in the markup: it is a picture of the product, not a
 * real client's project.
 */
export function ProjectPreview({ className }: { className?: string }) {
  return (
    <figure className={clsx('relative', className)} aria-label="Example of a client dashboard">
      <div className="card relative p-5 shadow-block sm:p-6">
        <div className="dim">your dashboard</div>
        <span className="stamp absolute -right-3 -top-4">Version 3 · approved</span>
        <p className="font-mono text-[11px] uppercase tracking-label text-muted">PRJ-0142 · example project</p>
        <p className="mt-1 font-display text-xl font-extrabold tracking-tight">Clinic booking system</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full border border-ink bg-paper">
          <div className="h-full w-[42%] bg-cobalt" />
        </div>
        <ol className="mt-5 grid gap-3">
          {STEPS.map((step, index) => (
            <li key={step.name} className="flex items-center gap-3 text-sm">
              <span
                className={clsx(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full border-[1.5px] border-ink font-mono text-[10px]',
                  step.state === 'done' && 'bg-ink text-paper',
                  step.state === 'now' && 'bg-sun',
                )}
                aria-hidden
              >
                {step.state === 'done' ? '✓' : index + 1}
              </span>
              <span className={clsx('flex-1', step.state === 'now' && 'font-semibold')}>{step.name}</span>
              <span className={clsx('font-mono text-[10.5px]', step.state === 'now' ? 'font-semibold text-cobalt' : 'text-muted')}>
                {step.note}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-xl border-[1.5px] border-dashed border-cobalt bg-cobalt-soft p-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-cobalt">Please approve</p>
          <p className="mt-1 text-sm font-medium">Booking pages, round 2</p>
          <div className="mt-2.5 flex gap-2">
            <span className="rounded-full bg-cobalt px-3 py-1 text-xs font-semibold text-white">Approve</span>
            <span className="rounded-full border-[1.5px] border-ink px-3 py-1 text-xs font-semibold">Ask for changes</span>
          </div>
        </div>
      </div>
      <div className="ml-auto mt-4 max-w-[85%] rounded-2xl rounded-br-md bg-cobalt px-4 py-3 text-sm text-white shadow-block-sm sm:-mr-4">
        Booking page is on the preview link. Try it on your phone and tell us what feels off.
        <span className="mt-1 block font-mono text-[10px] text-white/70">KleeLab team · build week 2</span>
      </div>
    </figure>
  );
}
