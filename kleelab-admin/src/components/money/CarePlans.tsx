'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pill } from '@/components/project/Pill';
import { CARE_INTERVAL, CARE_STATUS, errorText, formatDate, formatMinutes, formatMoney, formatTotals } from '@/components/project/format';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import type { CarePlanRow, MoneyTotal } from '@/types/api';

/** What the running plans bring in each month: yearly plans count as a twelfth. */
function monthly(plans: CarePlanRow[]): MoneyTotal[] {
  const totals = new Map<string, MoneyTotal>();
  for (const plan of plans.filter((p) => p.status === 'active')) {
    const entry = totals.get(plan.currency) ?? { currency: plan.currency, cents: 0, count: 0 };
    entry.cents += plan.interval === 'year' ? Math.round(plan.amount_cents / 12) : plan.amount_cents;
    entry.count += 1;
    totals.set(plan.currency, entry);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Every care plan that has not ended. They bill themselves; change one from its project. */
export function CarePlans() {
  const [plans, setPlans] = useState<CarePlanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminCarePlans()
      .then((list) => active && setPlans(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="tag">every month</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight">Care plans</h2>
          <p className="mt-1 text-sm text-muted">Each one sends its own invoice on its date. Start or change one from the project page.</p>
        </div>
        {plans && plans.length > 0 && (
          <p className="text-right">
            <span className="block font-mono text-[10px] uppercase tracking-label text-muted">Coming in a month</span>
            <span className="font-display text-2xl font-extrabold">{formatTotals(monthly(plans))}</span>
          </p>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} className="mt-4" />}
      {!plans ? (
        !error && <Skeleton rows={2} className="mt-4" />
      ) : plans.length === 0 ? (
        <p className="card mt-4 p-5 text-sm text-muted">No care plans yet.</p>
      ) : (
        <ul className="card mt-4 divide-y divide-line overflow-hidden">
          {plans.map((plan) => {
            const over = plan.minutes_included !== null && (plan.minutes_used ?? 0) > plan.minutes_included;
            return (
              <li key={plan.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                <div className="min-w-0 flex-1 basis-56">
                  <Link href={`/projects/${plan.project_id}`} className="block truncate text-sm font-semibold no-underline hover:text-cobalt">
                    {plan.project_title}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {plan.name} · {plan.client_name ?? plan.client_email ?? 'No client'}
                  </p>
                </div>
                <p className="w-40 text-sm">
                  <span className="font-semibold">{formatMoney(plan.amount_cents, plan.currency)}</span>
                  <span className="text-muted"> {CARE_INTERVAL[plan.interval].per}</span>
                </p>
                <p className="w-32 text-xs text-muted">
                  {plan.minutes_included !== null ? (
                    <span className={over ? 'font-semibold text-danger' : undefined}>
                      {formatMinutes(plan.minutes_used ?? 0)} of {formatMinutes(plan.minutes_included)}
                    </span>
                  ) : (
                    'Hours not counted'
                  )}
                </p>
                <p className="w-36 text-xs text-muted">{plan.status === 'active' ? `Next bill ${formatDate(plan.next_bill_on)}` : 'Not billing'}</p>
                <Pill tone={CARE_STATUS[plan.status].tone}>{CARE_STATUS[plan.status].label}</Pill>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
