'use client';

import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import type { Account } from '@/types/api';

/**
 * Plan and usage, for the dashboard.
 *
 * Usage is shown against the server's own limits rather than a copy kept here,
 * so the figure a customer sees is the figure they will be held to. A meter that
 * disagrees with the enforcement is worse than no meter: it makes the refusal
 * look like a bug.
 *
 * A meter that is *at* its limit is marked with weight and a filled bar rather
 * than colour, matching the studio's greyscale status language.
 */

function Meter({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const exhausted = used >= limit;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink">{label}</span>
        <span
          className={`font-mono text-xs ${exhausted ? 'font-bold text-ink' : 'text-muted'}`}
        >
          {used} / {limit}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="meter"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={`${label}: ${used} of ${limit} used`}
      >
        <span
          className={`block h-full rounded-full ${exhausted ? 'bg-ink' : 'bg-ink-soft'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </li>
  );
}

export function PlanCard({ account }: { account: Account }) {
  const { limits, usage } = account;
  const sitesFull = usage.sites >= limits.sites;
  const buildsFull = usage.ai_builds_this_month >= limits.ai_builds_per_month;

  return (
    <div className="rounded-xl border border-line bg-paper px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Plan</p>
          <p className="mt-1 font-serif text-2xl leading-none">{account.plan_label}</p>
          <p className="mt-2 max-w-md text-xs leading-5 text-muted">{account.plan_blurb}</p>
        </div>
        <Link
          href="/builder/upgrade"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-xs font-bold hover:border-ink"
        >
          {sitesFull || buildsFull ? 'Upgrade' : 'Compare plans'}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-line border-t border-line">
        <Meter
          label="Sites"
          used={usage.sites}
          limit={limits.sites}
          hint={sitesFull ? 'You have used every site this plan allows.' : undefined}
        />
        <Meter
          label="AI builds this month"
          used={usage.ai_builds_this_month}
          limit={limits.ai_builds_per_month}
          hint={buildsFull ? 'Resets on the 1st.' : undefined}
        />
      </ul>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-label text-muted">
        <span>{limits.custom_domain ? 'Custom domain included' : 'Custom domain on Pro'}</span>
        <span>{limits.storefront ? 'Shop included' : 'Shop on Pro'}</span>
      </p>
    </div>
  );
}
