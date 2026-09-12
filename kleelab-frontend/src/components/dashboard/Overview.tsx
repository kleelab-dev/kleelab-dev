'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/storefront';
import { apiService } from '@/services/api';
import type { ActivityEvent, DashboardStats, OrderSeries } from '@/types/api';

/**
 * Overview for the signed-in owner.
 *
 * Deliberately omits page views. Nothing emits analytics events yet, so the
 * figure would always be zero and would read as a broken dashboard rather than
 * an absent feature.
 */

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl leading-none">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function OrderChart({ series }: { series: OrderSeries }) {
  // Defensive: an uncaught render error here takes the whole overview down with
  // it, so never trust that a response matches the type it was cast to.
  const days = Array.isArray(series?.days) ? series.days : [];
  const total = days.reduce((sum, day) => sum + day.revenue, 0);
  const peak = days.reduce((max, day) => Math.max(max, day.revenue), 0);

  return (
    <div className="rounded-xl border border-line bg-paper px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
          Orders · last 30 days
        </p>
        <p className="font-mono text-[10px] text-muted">
          {days.reduce((sum, day) => sum + day.orders, 0)} orders
        </p>
      </div>

      {days.length === 0 || total === 0 ? (
        <p className="mt-6 text-xs leading-5 text-muted">
          No orders in the last 30 days. Once someone buys from a published site, this fills in.
        </p>
      ) : (
        <>
          <div className="mt-4 flex h-24 items-end gap-[3px]" role="img" aria-label={`Revenue per day over 30 days, peaking at ${peak.toFixed(2)}`}>
            {days.map((day) => {
              const height = peak > 0 ? Math.max((day.revenue / peak) * 100, day.revenue > 0 ? 6 : 2) : 2;
              return (
                <span
                  key={day.date}
                  title={`${day.date}: ${day.orders} order${day.orders === 1 ? '' : 's'}`}
                  className={`flex-1 rounded-sm ${day.revenue > 0 ? 'bg-ink' : 'bg-line'}`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-muted">
            <span>{days[0]?.date}</span>
            <span>{days[days.length - 1]?.date}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ActivityList({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-paper px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Recent activity</p>
        <p className="mt-3 text-xs leading-5 text-muted">
          Nothing yet. Publishing a site, editing a page or receiving an order will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-paper px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Recent activity</p>
      <ul className="mt-3 divide-y divide-line">
        {events.map((event, index) => (
          <li key={`${event.type}-${event.timestamp}-${index}`} className="flex items-baseline justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{event.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{event.description}</p>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted">
              {event.amount !== undefined && event.currency
                ? formatMoney(event.amount, event.currency)
                : new Date(event.timestamp).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Overview() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [series, setSeries] = useState<OrderSeries | null>(null);

  useEffect(() => {
    let active = true;
    // Each piece is independent: a failing chart must not blank the whole page.
    Promise.resolve().then(async () => {
      const [statsResult, activityResult, seriesResult] = await Promise.allSettled([
        apiService.getDashboardStats(),
        apiService.getRecentActivity(),
        apiService.getOrderSeries(),
      ]);
      if (!active) return;
      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
      if (seriesResult.status === 'fulfilled') setSeries(seriesResult.value);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!stats) return null;

  return (
    <section aria-label="Overview" className="mb-10 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sites"
          value={String(stats.site_count)}
          hint={`${stats.page_count} ${stats.page_count === 1 ? 'page' : 'pages'}`}
        />
        <StatCard label="Products" value={String(stats.product_count)} />
        <StatCard label="Orders" value={String(stats.order_count)} />
        <StatCard label="Revenue" value={formatMoney(stats.total_revenue, 'GBP')} hint="Paid, shipped and delivered" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {series && <OrderChart series={series} />}
        <ActivityList events={activity} />
      </div>
    </section>
  );
}
