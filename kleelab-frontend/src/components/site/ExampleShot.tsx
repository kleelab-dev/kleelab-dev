import { clsx } from 'clsx';
import type { WorkExample } from '@/content/work';
import { BrowserFrame } from '@/components/site/BrowserFrame';

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
        {['Alex', 'Sam', 'Jo'].map((name, i) => (
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

function Site() {
  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] gap-2 p-3">
      <div className="grid grid-cols-[1.2fr_1fr] items-center gap-3 rounded-md bg-paper p-2">
        <div className="grid gap-1.5">
          <span className="block h-2.5 w-4/5 rounded-full bg-ink" />
          <Lines widths={['90%', '70%']} />
          <span className="mt-0.5 block h-3 w-1/2 rounded-full bg-cobalt" />
        </div>
        <span className="block aspect-[4/3] rounded-sm border border-ink bg-sun" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="grid content-start gap-1 rounded-sm border border-line p-1.5">
            <span className="block h-2 w-2 rounded-full bg-cobalt" />
            <Lines widths={['80%', '55%']} />
          </span>
        ))}
      </div>
      <span className="block h-2 rounded-sm bg-ink" />
    </div>
  );
}

const SHOTS = { booking: Booking, portal: Portal, shop: Shop, tracker: Tracker, site: Site } as const;

/**
 * A tiny browser window showing the shape of an example project.
 * `lg` drops the graph-paper margin so the window can fill a hero column.
 */
export function ExampleShot({
  shot,
  className,
  size = 'sm',
  url,
}: {
  shot: WorkExample['shot'];
  className?: string;
  size?: 'sm' | 'lg';
  url?: string;
}) {
  const Shot = SHOTS[shot];
  return (
    <div aria-hidden className={clsx(size === 'sm' && 'bg-graph rounded-xl border-[1.5px] border-ink p-4 sm:p-5', className)}>
      <BrowserFrame url={url}>
        <div className="aspect-[16/9]">
          <Shot />
        </div>
      </BrowserFrame>
    </div>
  );
}
