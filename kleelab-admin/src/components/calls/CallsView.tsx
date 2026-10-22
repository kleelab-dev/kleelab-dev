'use client';

import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { errorText } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { TeamCall } from '@/types/api';
import { CallCard, isPast } from './CallCard';

/** Free first calls booked from the site: what is coming up, then the last two weeks. */
export function CallsView() {
  const [calls, setCalls] = useState<TeamCall[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminCalls()
      .then((list) => active && setCalls(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  const replace = (next: TeamCall) => setCalls((list) => list?.map((c) => (c.id === next.id ? next : c)) ?? null);
  const coming = (c: TeamCall) => c.status === 'booked' && !isPast(c);
  const upcoming = calls?.filter(coming) ?? [];
  // Most recent first for the ones already gone by.
  const earlier = calls?.filter((c) => !coming(c)).reverse() ?? [];

  return (
    <div>
      <p className="tag">team</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tightest">Calls</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Free first calls people booked on the site. Each one is also on their enquiry, with what they want to talk about.
      </p>

      <div className="mt-8">
        {error && <ErrorState message={error} onRetry={() => { setError(null); setCalls(null); setAttempt((n) => n + 1); }} />}
        {!error && calls === null && <Skeleton rows={3} />}
        {calls && (
          <div className="grid gap-10">
            <section>
              <h2 className="font-display text-xl font-extrabold tracking-tight">Coming up</h2>
              {upcoming.length === 0 ? (
                <EmptyState title="No calls booked" className="mt-4">
                  When someone books a time on the site, it shows here and the team gets an email.
                </EmptyState>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {upcoming.map((call) => (
                    <CallCard key={call.id} call={call} onChange={replace} />
                  ))}
                </div>
              )}
            </section>
            {earlier.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-extrabold tracking-tight">Last two weeks</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {earlier.map((call) => (
                    <CallCard key={call.id} call={call} onChange={replace} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
