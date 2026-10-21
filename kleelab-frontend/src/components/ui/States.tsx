import { clsx } from 'clsx';

/** A grey bar standing in for a line of text that is on its way. */
export function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={clsx('block rounded-full bg-line motion-safe:animate-pulse', className)} />;
}

/**
 * Placeholder shaped like what is loading. Announced once to screen readers,
 * then hidden from them: the bars themselves mean nothing.
 */
export function Loading({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

/** A failed load, with a way to try again without reloading the page. */
export function ErrorState({
  title = 'That did not load',
  message,
  onRetry,
  children,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={clsx('card max-w-xl p-6 sm:p-7', className)}>
      <p className="font-display text-2xl font-extrabold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center rounded-full bg-cobalt px-5 text-sm font-semibold text-white hover:bg-cobalt-dark"
          >
            Try again
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
