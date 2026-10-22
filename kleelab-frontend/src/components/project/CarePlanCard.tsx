import type { CarePlan } from '@/types/api';
import { formatDate, formatMoney } from './format';
import { Pill } from './Pill';

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/** The client's care plan: what it covers, what it costs, and the hours used this period. */
export function CarePlanCard({ plan }: { plan: CarePlan }) {
  const used = plan.minutes_used ?? 0;
  const paused = plan.status === 'paused';
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{plan.name}</span>
        {paused && <Pill tone="bg-sun-soft text-ink">Paused</Pill>}
      </div>
      <p className="font-display text-2xl font-extrabold">
        {formatMoney(plan.amount_cents, plan.currency)}
        <span className="ml-1 text-sm font-normal text-muted">{plan.interval === 'year' ? 'a year' : 'a month'}</span>
      </p>
      {plan.includes && (
        <ul className="grid gap-1 text-sm">
          {plan.includes.split('\n').filter((l) => l.trim()).map((line, i) => (
            <li key={i} className="flex gap-2"><span aria-hidden className="text-cobalt">·</span>{line}</li>
          ))}
        </ul>
      )}
      {plan.minutes_included !== null && (
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span>Hours used</span>
            <span className="text-muted">{hours(used)} of {hours(plan.minutes_included)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full border-[1.5px] border-ink bg-white" aria-hidden>
            <div className="h-full bg-cobalt" style={{ width: `${Math.min(100, (used / plan.minutes_included) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">Since {formatDate(plan.period_start)}. Unused hours don&apos;t carry over.</p>
        </div>
      )}
      <p className="text-xs text-muted">
        {paused
          ? 'No invoices while it is paused. Send us a message to start it again.'
          : `Next invoice ${formatDate(plan.next_bill_on)}. It pays for the ${plan.interval} ahead.`}
      </p>
    </div>
  );
}
