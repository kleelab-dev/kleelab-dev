import { clsx } from 'clsx';

/** A numbered list of steps on a cobalt rail, with an optional stamp on the last one. */
export function StepRail({ steps, stamp, className }: { steps: string[]; stamp?: string; className?: string }) {
  return (
    <ol className={clsx('relative grid gap-5', className)}>
      <span aria-hidden className="absolute bottom-4 left-[15px] top-4 w-[1.5px] bg-cobalt" />
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step} className="relative flex gap-4">
            <span
              className={clsx(
                'relative grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] font-mono text-xs',
                last ? 'border-ink bg-sun' : 'border-cobalt bg-white text-cobalt',
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0 pt-1 leading-relaxed">
              {step}
              {last && stamp && (
                <>
                  {' '}
                  <span aria-hidden className="stamp ml-1 whitespace-nowrap align-middle">{stamp}</span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
