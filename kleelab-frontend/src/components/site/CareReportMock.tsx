import { CheckIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { BrowserFrame } from '@/components/site/BrowserFrame';

const ROWS = [
  { item: 'Updates', note: 'Software and plugins brought up to date', done: 'tick' },
  { item: 'Checks', note: 'Everything is running as it should', done: 'tick' },
  { item: 'Fixes', note: 'Nothing needed fixing this month', done: 'tick' },
  { item: 'Changes you asked for', note: 'New opening hours on the contact page', done: 'done' },
] as const;

/** An example of the short monthly report a care plan sends. No uptime or speed figures. */
export function CareReportMock({ className }: { className?: string }) {
  return (
    <figure aria-label="Example of a monthly care report" className={clsx('relative', className)}>
      <div aria-hidden className="bg-graph rounded-2xl border-[1.5px] border-ink p-4 shadow-block sm:p-6">
        <BrowserFrame url="your dashboard · care">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-label text-cobalt">Monthly report · example</p>
                <p className="mt-1 font-display text-lg font-extrabold tracking-tight">This month on your site</p>
              </div>
              <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 font-mono text-[10px] uppercase tracking-label">
                All well
              </span>
            </div>
            <ul className="grid divide-y divide-line">
              {ROWS.map((row) => (
                <li key={row.item} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{row.item}</span>
                    <span className="block text-xs text-muted">{row.note}</span>
                  </span>
                  {row.done === 'tick' ? (
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sun">
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-cobalt px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-cobalt">
                      Done
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-xl border-[1.5px] border-dashed border-cobalt bg-cobalt-soft p-3">
              <p className="font-mono text-[10px] uppercase tracking-label text-cobalt">A note from the team</p>
              <p className="mt-1 text-xs leading-relaxed">
                A quiet month. Next month we would like to tidy up old images so pages load a little faster.
              </p>
            </div>
          </div>
        </BrowserFrame>
      </div>
    </figure>
  );
}
