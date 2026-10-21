import { clsx } from 'clsx';

/** Grey placeholder blocks shaped like the cards that are on their way. */
export function Skeleton({ rows = 3, className, card = true }: { rows?: number; className?: string; card?: boolean }) {
  return (
    <div className={clsx('grid gap-4', className)} role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={clsx('animate-pulse', card && 'card p-5')} aria-hidden>
          <div className="h-4 w-2/5 rounded-full bg-line" />
          <div className="mt-3 h-3 w-3/4 rounded-full bg-line/70" />
          <div className="mt-2 h-3 w-1/2 rounded-full bg-line/70" />
        </div>
      ))}
    </div>
  );
}

/** What an empty list says, with an optional next step. */
export function EmptyState({ title, children, action, className }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-2xl border-[1.5px] border-dashed border-line bg-white/60 px-5 py-8 text-center', className)}>
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** A failed load, with a way to try again without reloading the page. */
export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={clsx('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-danger-soft p-4 text-sm text-danger', className)}>
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}
