'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SitePageShell } from '@/components/dashboard/SiteNav';
import { apiService } from '@/services/api';
import { formatMoney } from '@/lib/storefront';
import type { Order, OrderStatus, Site } from '@/types/api';

/** Mirrors ALLOWED_STATUSES in `routers/orders.py`. */
const STATUSES: OrderStatus[] = ['pending', 'paid', 'shipped', 'delivered', 'refunded'];

/** What counts as money actually earned. Matches the dashboard's revenue query. */
const EARNING: OrderStatus[] = ['paid', 'shipped', 'delivered'];

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-canvas text-muted',
  paid: 'bg-ink text-paper',
  shipped: 'bg-ink text-paper',
  delivered: 'bg-ink text-paper',
  refunded: 'bg-canvas text-muted line-through',
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrdersManager({ siteId }: { siteId: string }) {
  const [site, setSite] = useState<Site | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedSite, loadedOrders] = await Promise.all([
        apiService.getSite(siteId),
        apiService.getOrders(siteId),
      ]);
      setSite(loadedSite);
      // Newest first: the dashboard is a work queue, not an archive.
      setOrders(
        [...loadedOrders].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const changeStatus = async (order: Order, status: OrderStatus) => {
    setBusyId(order.id);
    setError(null);
    try {
      const updated = await apiService.updateOrderStatus(siteId, order.id, status);
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not change the status.');
    } finally {
      setBusyId(null);
    }
  };

  const currency = site?.currency ?? 'GBP';
  const earned = useMemo(
    () =>
      orders
        .filter((order) => EARNING.includes(order.status))
        .reduce((sum, order) => sum + order.total, 0),
    [orders],
  );
  const awaiting = useMemo(
    () => orders.filter((order) => order.status === 'pending').length,
    [orders],
  );

  if (loading) {
    return <p className="text-sm text-muted">Loading orders…</p>;
  }

  return (
    <SitePageShell
      siteId={siteId}
      siteName={site?.name ?? ''}
      title="Orders"
      description={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`}
    >
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {orders.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-paper px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Orders</p>
            <p className="mt-2 font-serif text-2xl">{orders.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-paper px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              Awaiting action
            </p>
            <p className="mt-2 font-serif text-2xl">{awaiting}</p>
          </div>
          <div className="rounded-xl border border-line bg-paper px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              Earned
            </p>
            <p className="mt-2 font-serif text-2xl">{formatMoney(earned, currency)}</p>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-paper p-10 text-center">
          <p className="font-serif text-2xl">No orders yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Orders arrive here when someone buys from your published site. Add products and publish
            to get started.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/builder/${siteId}/products`}
              className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper hover:bg-ink-soft"
            >
              Add products
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="overflow-hidden rounded-xl border border-line bg-paper">
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">
                    {order.customer_name || order.customer_email}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatWhen(order.created_at)} · {order.items.length}{' '}
                    {order.items.length === 1 ? 'item' : 'items'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-serif text-xl">{formatMoney(order.total, order.currency)}</span>

                  <label className="sr-only" htmlFor={`status-${order.id}`}>
                    Status for the order from {order.customer_email}
                  </label>
                  <select
                    id={`status-${order.id}`}
                    value={order.status}
                    disabled={busyId === order.id}
                    onChange={(event) => void changeStatus(order, event.target.value as OrderStatus)}
                    className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider outline-none disabled:opacity-40 ${STATUS_STYLES[order.status]}`}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <details className="border-t border-line px-5 py-3">
                <summary className="cursor-pointer text-xs font-bold text-muted hover:text-ink">
                  What they ordered
                </summary>
                <div className="mt-3">
                  <ul className="divide-y divide-line">
                    {order.items.map((line) => (
                      <li
                        key={`${order.id}-${line.product_id}`}
                        className="flex justify-between gap-4 py-2 text-sm"
                      >
                        <span>
                          {line.name}
                          <span className="text-muted">
                            {' '}
                            × {line.quantity} @ {formatMoney(line.unit_price, order.currency)}
                          </span>
                        </span>
                        <span>{formatMoney(line.line_total, order.currency)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted">
                    Contact:{' '}
                    <a href={`mailto:${order.customer_email}`} className="underline underline-offset-2">
                      {order.customer_email}
                    </a>
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    Prices are the ones recorded when the order was placed, so later edits to the
                    product do not change this.
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </SitePageShell>
  );
}
