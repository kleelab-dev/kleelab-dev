import { clsx } from 'clsx';

/** Said quietly when a background refresh fails: what is on screen may be a little old. */
export function StaleNote({ className }: { className?: string }) {
  return (
    <p role="status" className={clsx('flex items-center gap-2 text-xs text-muted', className)}>
      <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-sun" />
      We could not check for changes just now. This may be a little out of date; we will keep trying.
    </p>
  );
}
