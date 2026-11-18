import { clsx } from 'clsx';

const LINES = [
  { item: 'Planning and page map', weeks: 'Week 1' },
  { item: 'Design for phone and desktop', weeks: 'Weeks 2–3' },
  { item: 'Build, with a weekly preview', weeks: 'Weeks 3–5' },
  { item: 'Testing and going live', weeks: 'Week 6' },
];

/** An example of the written plan a client approves before work starts. Dates only, never prices. */
export function QuoteMock({ size = 'lg', className }: { size?: 'sm' | 'lg'; className?: string }) {
  const small = size === 'sm';
  return (
    <figure aria-label="Example of the written plan you get" className={clsx('relative', className)}>
      <div
        aria-hidden
        className={clsx(
          'relative rounded-2xl border-[1.5px] border-ink bg-white',
          small ? 'p-5 shadow-block-sm' : 'p-6 shadow-block sm:p-8',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b-[1.5px] border-ink pb-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-label text-cobalt">Written plan · example</p>
            <p className={clsx('mt-1 font-display font-extrabold tracking-tight', small ? 'text-lg' : 'text-2xl')}>A new website</p>
          </div>
          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-muted">
            Rev 1
          </span>
        </div>
        <ul className={clsx('grid', small ? 'gap-2 py-3 text-xs' : 'gap-3 py-5 text-sm')}>
          {LINES.map((line, index) => (
            <li key={line.item} className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] text-cobalt">{String(index + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1">{line.item}</span>
              <span className="shrink-0 border-b border-dashed border-line font-mono text-[10px] uppercase tracking-label text-muted">
                {line.weeks}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t-[1.5px] border-ink pt-4">
          <span className="font-mono text-[10px] uppercase tracking-label text-muted">Total</span>
          <span className={clsx('font-display font-bold', small ? 'text-sm' : 'text-base')}>
            Fixed price, agreed before work starts
          </span>
        </div>
        <span className={clsx('stamp absolute bg-white', small ? '-top-3 right-4' : '-top-3 right-6 text-xs')}>Approved</span>
      </div>
    </figure>
  );
}
