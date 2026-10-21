'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { ArrowDownTrayIcon, CheckIcon, ExclamationTriangleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { errorText, formatMoney, isOverdue, sumInvoices, todayISO } from '@/components/project/format';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import type { AdminInvoice, MoneyTotal } from '@/types/api';
import { InvoiceRow } from './InvoiceRow';

type Filter = 'unpaid' | 'overdue' | 'paid' | 'cancelled' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'unpaid', label: 'Not paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

function matches(invoice: AdminInvoice, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return isOverdue(invoice);
  return invoice.status === filter;
}

function paidIn(invoice: AdminInvoice, prefix: string): boolean {
  return invoice.status === 'paid' && Boolean(invoice.paid_at?.startsWith(prefix));
}

/** Spreadsheet-safe CSV: quoted, and formula-looking cells defused. */
function toCsv(rows: (string | number | null)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let text = cell === null ? '' : String(cell);
          if (/^[=+\-@]/.test(text)) text = `'${text}`;
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}

function downloadCsv(invoices: AdminInvoice[]) {
  const csv = toCsv([
    ['Number', 'Title', 'Client', 'Client email', 'Project', 'Currency', 'Amount', 'Status', 'Issued', 'Due', 'Paid'],
    ...invoices.map((i) => [
      i.number,
      i.title,
      i.client_name,
      i.client_email,
      `${i.project_title} (${i.project_reference})`,
      i.currency,
      (i.amount_cents / 100).toFixed(2),
      isOverdue(i) ? 'overdue' : i.status,
      i.created_at.slice(0, 10),
      i.due_date,
      i.paid_at ? i.paid_at.slice(0, 10) : null,
    ]),
  ]);
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `kleelab-invoices-${todayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Every invoice across every project: what is owed, what is late, what came in. */
export function MoneyView() {
  const initial = useSearchParams().get('show');
  const [invoices, setInvoices] = useState<AdminInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.value === initial) ? (initial as Filter) : 'unpaid');
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminInvoices()
      .then((list) => active && setInvoices(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  const all = invoices ?? [];
  const month = todayISO().slice(0, 7);
  const year = todayISO().slice(0, 4);
  const outstanding = sumInvoices(all.filter((i) => i.status === 'unpaid'));
  const overdue = sumInvoices(all.filter(isOverdue));
  const paidMonth = sumInvoices(all.filter((i) => paidIn(i, month)));
  const paidYear = sumInvoices(all.filter((i) => paidIn(i, year)));
  const count = (totals: { count: number }[]) => totals.reduce((n, t) => n + t.count, 0);
  const plural = (n: number) => `${n} ${n === 1 ? 'invoice' : 'invoices'}`;

  const needle = query.trim().toLowerCase();
  const shown = all.filter(
    (i) =>
      matches(i, filter) &&
      (!needle ||
        [i.number, i.title, i.client_name, i.client_email, i.project_title, i.project_reference].some((v) => v?.toLowerCase().includes(needle))),
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tag">team</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Money</h1>
          <p className="mt-3 text-muted">Every invoice on every project. Send new ones from the project page.</p>
        </div>
        <Button type="button" variant="secondary" disabled={!shown.length} onClick={() => downloadCsv(shown)}>
          <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
          Download CSV
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Total label="Waiting to be paid" value={invoices && outstanding} note={invoices && plural(count(outstanding))} highlight />
        <Total
          label="Overdue"
          value={invoices && overdue}
          empty="Nothing"
          note={invoices && (overdue.length ? `${plural(count(overdue))} past the pay-by date` : 'Everyone is on time')}
          warning={overdue.length > 0}
        />
        <Total label="Paid this month" value={invoices && paidMonth} note={invoices && plural(count(paidMonth))} />
        <Total label={`Paid in ${year}`} value={invoices && paidYear} note={invoices && plural(count(paidYear))} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show invoices">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={clsx('rounded-full px-3.5 py-1.5 text-sm', filter === value ? 'bg-ink text-paper' : 'border-[1.5px] border-line bg-white hover:border-ink')}
            >
              {label}
              {invoices && value !== 'all' && <span className="ml-1.5 opacity-60">{all.filter((i) => matches(i, value)).length}</span>}
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-72">
          <span className="sr-only">Search invoices</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Number, client or project"
            className="field py-2 pl-9 text-sm"
          />
        </label>
      </div>

      {error && <ErrorState message={error} onRetry={invoices === null ? () => { setError(null); setInvoices(null); setAttempt((n) => n + 1); } : undefined} className="mt-6" />}
      {notice && !error && (
        <p role="status" className="mt-6 flex items-center gap-2 rounded-xl bg-mint p-3 text-sm text-ink">
          <CheckIcon className="h-4 w-4" aria-hidden />
          {notice}
        </p>
      )}

      <div className="card mt-6 overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_9rem_8.5rem_auto] gap-x-4 border-b-[1.5px] border-ink bg-paper px-5 py-2.5 font-mono text-[10px] uppercase tracking-label text-muted md:grid">
          <span>Invoice</span>
          <span>Client and project</span>
          <span className="text-right">Amount</span>
          <span>Status</span>
          <span className="w-[8.5rem]" />
        </div>
        {invoices === null ? (
          error ? <p className="p-5 text-sm text-muted">Invoices could not be loaded.</p> : <Skeleton rows={4} card={false} className="p-5" />
        ) : shown.length === 0 ? (
          <EmptyState
            title={needle ? 'No invoices match' : filter === 'overdue' ? 'Nothing is overdue' : all.length ? 'Nothing in this list' : 'No invoices yet'}
            className="m-4 border-line"
          >
            {needle ? 'Try an invoice number, a client or a project.' : all.length ? 'Pick another filter above.' : 'Send an invoice from a project page; it shows here with the rest.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                onChange={(next, message) => {
                  setInvoices((list) => list?.map((i) => (i.id === next.id ? next : i)) ?? list);
                  setError(null);
                  setNotice(message);
                }}
                onError={setError}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Total({
  label,
  value,
  empty = 'NGN 0.00',
  note,
  highlight,
  warning,
}: {
  label: string;
  /** One line per currency. */
  value: MoneyTotal[] | null;
  empty?: string;
  note?: string | null;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={clsx('card p-5', highlight && 'shadow-block')}>
      <p className="font-mono text-[11px] uppercase tracking-label text-muted">{label}</p>
      <div className={clsx('mt-2 font-display text-2xl font-extrabold tracking-tight', warning ? 'text-danger' : 'text-ink')}>
        {value === null ? (
          <span className="text-line">—</span>
        ) : value.length === 0 ? (
          empty
        ) : (
          value.map((total) => (
            <p key={total.currency} className="truncate [&+&]:mt-0.5 [&+&]:text-lg">
              {formatMoney(total.cents, total.currency)}
            </p>
          ))
        )}
      </div>
      {note && (
        <p className={clsx('mt-1 flex items-center gap-1 text-xs', warning ? 'font-medium text-danger' : 'text-muted')}>
          {warning && <ExclamationTriangleIcon className="h-3.5 w-3.5" aria-hidden />}
          {note}
        </p>
      )}
    </div>
  );
}
