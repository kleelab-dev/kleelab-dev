import {
  ChatBubbleLeftEllipsisIcon,
  CheckBadgeIcon,
  DocumentTextIcon,
  MapIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { Reveal } from '@/components/site/Reveal';

const FEATURES = [
  { icon: MapIcon, title: 'Every step', body: 'The whole plan, from the first call to hand-over. You can see where we are now and what comes next.' },
  { icon: ChatBubbleLeftEllipsisIcon, title: 'Updates and messages', body: 'News from us and a place to ask questions. All in one place, not lost in your inbox.' },
  { icon: CheckBadgeIcon, title: 'Approve with one click', body: 'Approve a design or ask for changes. Every decision is saved, so nobody has to remember.' },
  { icon: DocumentTextIcon, title: 'Links and files', body: 'Preview links and documents, shared both ways and easy to find.' },
  { icon: PlusCircleIcon, title: 'Extra help when you want it', body: 'Ask us to put it online, host it or look after it, whenever you are ready.' },
];

const STAGES = [
  ['Planning', 'done'],
  ['Design', 'done'],
  ['Build', 'now'],
  ['Testing', 'todo'],
  ['Going live', 'todo'],
  ['Hand-over', 'todo'],
] as const;

/** A numbered callout, matching a row in the legend beside the drawing. */
function Pin({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'absolute z-10 grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-ink bg-sun font-mono text-xs font-semibold text-ink shadow-block-sm',
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * A large drawing of the client dashboard with numbered callouts, for the
 * dark band on the home page. Example data only, labelled as such.
 */
export function DashboardShowcase() {
  return (
    <div className="mt-14 grid gap-12 lg:grid-cols-[1.45fr_1fr] lg:items-center">
      <Reveal>
        <figure aria-label="Example of the client dashboard" className="relative">
          <div className="overflow-hidden rounded-2xl border-[1.5px] border-paper bg-white text-ink shadow-[8px_8px_0_0_#ffd23f]">
            <div className="flex items-center gap-2 border-b-[1.5px] border-ink bg-paper px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full border border-ink bg-white" />
              <span className="h-2.5 w-2.5 rounded-full border border-ink bg-white" />
              <span className="h-2.5 w-2.5 rounded-full border border-ink bg-white" />
              <span className="ml-3 truncate rounded-full border border-line bg-white px-3 py-0.5 font-mono text-[10px] text-muted">
                kleelab.com/dashboard · example
              </span>
            </div>
            <div className="grid sm:grid-cols-[170px_1fr]">
              <div className="relative border-b-[1.5px] border-ink bg-graph p-4 sm:border-b-0 sm:border-r-[1.5px]">
                <Pin n={1} className="right-3 top-3 sm:-right-3.5" />
                <p className="font-mono text-[10px] uppercase tracking-label text-muted">Stages</p>
                <ol className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-1">
                  {STAGES.map(([name, state]) => (
                    <li key={name} className="flex items-center gap-2 text-xs">
                      <span
                        className={clsx(
                          'grid h-4 w-4 shrink-0 place-items-center rounded-full border border-ink text-[8px]',
                          state === 'done' && 'bg-ink text-paper',
                          state === 'now' && 'bg-sun',
                        )}
                      >
                        {state === 'done' ? '✓' : ''}
                      </span>
                      <span className={clsx(state === 'now' && 'font-semibold')}>{name}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="grid gap-4 p-4 sm:p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-label text-muted">PRJ-0142 · build week 2</p>
                    <p className="font-display text-lg font-extrabold tracking-tight">Clinic booking system</p>
                  </div>
                  <span className="font-mono text-[11px] text-cobalt">42%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full border border-ink bg-paper">
                  <div className="h-full w-[42%] bg-cobalt" />
                </div>

                <div className="relative rounded-xl border-[1.5px] border-ink p-3">
                  <Pin n={2} className="-right-3 -top-3" />
                  <p className="font-mono text-[10px] uppercase tracking-label text-cobalt">Update · Tuesday</p>
                  <p className="mt-1 text-sm">Booking pages are on the preview link. Payments go in next.</p>
                  <div className="mt-2 ml-auto w-fit rounded-xl rounded-br-sm bg-cobalt-soft px-3 py-1.5 text-xs">
                    Looks great. Can we add Saturday slots?
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="relative rounded-xl border-[1.5px] border-dashed border-cobalt bg-cobalt-soft p-3">
                    <Pin n={3} className="-left-3 -top-3" />
                    <p className="font-mono text-[10px] uppercase tracking-label text-cobalt">Please approve</p>
                    <p className="mt-1 text-sm font-medium">Booking pages, round 2</p>
                    <div className="mt-2 flex gap-1.5">
                      <span className="rounded-full bg-cobalt px-2.5 py-0.5 text-[11px] font-semibold text-white">Approve</span>
                      <span className="rounded-full border border-ink px-2.5 py-0.5 text-[11px] font-semibold">Changes</span>
                    </div>
                  </div>
                  <div className="relative rounded-xl border-[1.5px] border-ink p-3">
                    <Pin n={4} className="-right-3 -top-3" />
                    <p className="font-mono text-[10px] uppercase tracking-label text-muted">Files and links</p>
                    <ul className="mt-1.5 grid gap-1 text-xs">
                      <li className="flex items-center gap-1.5">
                        <DocumentTextIcon className="h-3.5 w-3.5 text-cobalt" /> Project plan v2.pdf
                      </li>
                      <li className="flex items-center gap-1.5">
                        <DocumentTextIcon className="h-3.5 w-3.5 text-cobalt" /> Clinic logo.svg
                      </li>
                      <li className="flex items-center gap-1.5 text-cobalt underline underline-offset-2">preview.clinic-booking ↗</li>
                    </ul>
                  </div>
                </div>

                <div className="relative flex items-center justify-between gap-3 rounded-xl bg-sun-soft px-3 py-2.5">
                  <Pin n={5} className="-left-3 -top-3" />
                  <p className="text-xs">
                    <span className="font-semibold">Hosting and monthly care</span> · add any time
                  </p>
                  <span className="rounded-full border border-ink bg-white px-2.5 py-0.5 text-[11px] font-semibold">Add</span>
                </div>
              </div>
            </div>
          </div>
        </figure>
      </Reveal>

      <ol className="grid gap-5">
        {FEATURES.map((feature, index) => (
          <Reveal as="li" key={feature.title} delay={index * 80} className="grid grid-cols-[28px_1fr] gap-4">
            <span className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-paper bg-sun font-mono text-xs font-semibold text-ink">
              {index + 1}
            </span>
            <div>
              <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                <feature.icon className="h-5 w-5 text-sun" aria-hidden />
                {feature.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-paper/70">{feature.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
