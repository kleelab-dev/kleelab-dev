import { clsx } from 'clsx';

/**
 * A drawn browser window: three dots, an optional address pill, then the page.
 * Purely a frame; the caller decides whether the contents are hidden from screen readers.
 */
export function BrowserFrame({
  url,
  children,
  className,
}: {
  url?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('overflow-hidden rounded-lg border-[1.5px] border-ink bg-white shadow-block-sm', className)}>
      <div className="flex items-center gap-1 border-b border-ink bg-paper px-2 py-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-ink" />
        <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-ink" />
        <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-ink" />
        {url && (
          <span className="ml-2 min-w-0 truncate rounded-full border border-line bg-white px-2 py-px font-mono text-[8px] text-muted">
            {url}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
