'use client';

import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { ApiError } from '@/services/api';

/**
 * Turns a refused request into the right next step.
 *
 * The backend distinguishes a plan refusal (`code: plan_limit`) from a failure.
 * Without this, both arrive as a sentence in a red-ish box, and a customer who
 * has simply outgrown their plan is told something went wrong — when in fact
 * nothing did, and there is a button that fixes it.
 *
 * Renders the message either way; only the call to action differs.
 */
export function PlanLimitHint({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || !error.isPlanLimit) return null;

  const path = error.upgradePath ?? '/builder/upgrade';
  const retryTomorrow = error.details?.retryableTomorrow === true;

  return (
    <p className="mt-2 text-xs">
      {retryTomorrow ? (
        // A daily cap resets on its own, so an upgrade is not the only answer and
        // should not be presented as though it were.
        <span className="text-muted">
          You can also carry on with the editor and publish what you have.
        </span>
      ) : (
        <Link href={path} className="inline-flex items-center gap-1 font-bold underline">
          See what a bigger plan includes
          <ArrowRightIcon className="h-3 w-3" aria-hidden />
        </Link>
      )}
    </p>
  );
}
