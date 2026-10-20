import { clsx } from 'clsx';

export function Pill({ tone, children, className }: { tone: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-label', tone, className)}>
      {children}
    </span>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="h-2.5 overflow-hidden rounded-full border-[1.5px] border-ink bg-white" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Project progress">
        <div className="h-full bg-cobalt transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-label text-muted">
        {done} of {total} steps done · {pct}%
      </p>
    </div>
  );
}

export function Panel({ tag, title, action, children, className }: { tag?: string; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('card p-5 sm:p-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {tag && <p className="tag">{tag}</p>}
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
