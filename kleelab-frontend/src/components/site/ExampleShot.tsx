import { clsx } from 'clsx';
import type { WorkExample } from '@/content/work';

/** Grey bars standing in for copy. */
function Lines({ widths, className }: { widths: string[]; className?: string }) {
  return (
    <div className={clsx('grid gap-1', className)}>
      {widths.map((w, i) => (
        <span key={i} className="block h-1.5 rounded-full bg-line" style={{ width: w }} />
      ))}
    </div>
  );
}

function Booking() {
  return (
    <div className="grid h-full grid-cols-[1fr_1.3fr] gap-3 p-3">
      <div className="grid content-start gap-2">
        <span className="block h-2.5 w-3/4 rounded-full bg-ink" />
        {['Dr Ade', 'Dr Bello', 'Nurse Kemi'].map((name, i) => (
          <span key={name} className={clsx('flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[8px]', i === 0 ? 'border-cobalt bg-cobalt-soft' : 'border-line')}>
            <span className="h-3 w-3 rounded-full bg-grid" /> {name}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-4 content-start gap-1">
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} className={clsx('h-4 rounded-sm border', i === 6 ? 'border-ink bg-sun' : i % 5 === 0 ? 'border-line bg-grid' : 'border-line')} />
        ))}
        <span className="col-span-4 mt-1 block h-4 rounded-full bg-cobalt" />
      </div>
    </div>
  );
}

function Portal() {
  return (
    <div className="grid h-full grid-cols-[52px_1fr] gap-3 p-3">
      <div className="grid content-start gap-2 rounded-md bg-ink p-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={clsx('block h-1.5 rounded-full', i === 1 ? 'bg-sun' : 'bg-paper/40')} />
        ))}
      </div>
      <div className="grid content-start gap-2">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full border border-ink bg-sun" />
          <Lines widths={['60%', '40%']} className="flex-1" />
        </div>
        {['Summer fair', 'AGM', 'Volunteer day'].map((event, i) => (
          <span key={event} className="flex items-center justify-between rounded-md border border-line px-2 py-1 text-[8px]">
            {event}
            <span className={clsx('rounded-full px-1.5 py-px text-[7px] font-semibold', i === 0 ? 'bg-mint' : 'bg-cobalt text-white')}>
              {i === 0 ? 'Going' : 'Sign up'}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Shop() {
  return (
    <div className="grid h-full grid-cols-3 gap-2 p-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid content-start gap-1.5 rounded-md border border-line p-1.5">
          <span className={clsx('block aspect-square rounded-sm', i === 1 ? 'bg-sun' : 'bg-grid')} />
          <Lines widths={['80%', '50%']} />
          <span className={clsx('mt-0.5 block h-3 rounded-full', i === 1 ? 'bg-ink' : 'border border-ink')} />
        </div>
      ))}
    </div>
  );
}

function Tracker() {
  return (
    <div className="grid h-full grid-cols-3 gap-2 p-3">
      {['To do', 'Doing', 'Done'].map((col, c) => (
        <div key={col} className="grid content-start gap-1.5 rounded-md bg-paper p-1.5">
          <span className="font-mono text-[7px] uppercase text-muted">{col}</span>
          {Array.from({ length: 3 - (c === 2 ? 1 : 0) }, (_, i) => (
            <span key={i} className={clsx('block rounded-sm border bg-white p-1', c === 1 && i === 0 ? 'border-ink shadow-[2px_2px_0_0_#0e1530]' : 'border-line')}>
              <Lines widths={['85%', '55%']} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const SHOTS = { booking: Booking, portal: Portal, shop: Shop, tracker: Tracker } as const;

/** A tiny browser window showing the shape of an example project. */
export function ExampleShot({ shot, className }: { shot: WorkExample['shot']; className?: string }) {
  const Shot = SHOTS[shot];
  return (
    <div aria-hidden className={clsx('bg-graph rounded-xl border-[1.5px] border-ink p-4 sm:p-5', className)}>
      <div className="overflow-hidden rounded-lg border-[1.5px] border-ink bg-white shadow-block-sm">
        <div className="flex items-center gap-1 border-b border-ink bg-paper px-2 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full border border-ink" />
          <span className="h-1.5 w-1.5 rounded-full border border-ink" />
          <span className="h-1.5 w-1.5 rounded-full border border-ink" />
        </div>
        <div className="aspect-[16/9]">
          <Shot />
        </div>
      </div>
    </div>
  );
}
