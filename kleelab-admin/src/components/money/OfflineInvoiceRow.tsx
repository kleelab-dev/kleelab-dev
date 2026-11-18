'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ArrowDownTrayIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { Pill } from '@/components/project/Pill';
import { errorText, formatDate, formatMoney, INVOICE_STATUS, isOverdue, promiseMissed } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { OfflineMoneyInvoice } from '@/types/api';

/** An offline invoice as a row, laid out on the same grid as `InvoiceRow`. */
export function OfflineInvoiceRow({ invoice, onError }: { invoice: OfflineMoneyInvoice; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const status = INVOICE_STATUS[invoice.status];
  const missed = promiseMissed(invoice);
  const late = isOverdue(invoice);
  const open = invoice.status === 'unpaid' || invoice.status === 'part_paid';

  async function pdf() {
    setBusy(true);
    try {
      await apiService.downloadOfflineInvoicePdf(invoice);
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-x-4 gap-y-2 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_9rem_8.5rem_auto] md:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-label text-cobalt">
          {invoice.number}
          <span className="rounded-full border border-ink bg-sun-soft px-2 py-px text-[10px] font-semibold text-ink">Offline</span>
        </p>
        <Link href={`/money/offline/${invoice.id}`} className="block truncate text-sm font-semibold text-ink no-underline hover:text-cobalt">
          {invoice.title}
        </Link>
      </div>
      <div className="min-w-0 text-sm">
        <Link href={`/money/contacts/${invoice.contact_id}`} className="block truncate font-medium text-ink no-underline hover:text-cobalt">
          {invoice.client_name}
        </Link>
        {invoice.client_company && <p className="truncate text-muted">{invoice.client_company}</p>}
      </div>
      <div className="md:text-right">
        <p className={clsx('font-display text-lg font-extrabold', invoice.status === 'cancelled' && 'text-muted line-through')}>
          {formatMoney(invoice.amount_cents, invoice.currency)}
        </p>
        {invoice.status === 'part_paid' && <p className="text-xs text-muted">{formatMoney(invoice.balance_cents, invoice.currency)} left</p>}
      </div>
      <div className="text-xs">
        {missed ? <Pill tone="bg-danger-soft text-danger">Promise missed</Pill> : <Pill tone={late ? 'bg-danger-soft text-danger' : status.tone}>{late ? 'Overdue' : status.label}</Pill>}
        <p className={clsx('mt-1', missed || late ? 'font-medium text-danger' : 'text-muted')}>
          {missed
            ? `Promised ${formatDate(invoice.balance_promised_on)}`
            : invoice.status === 'paid' && invoice.paid_at
              ? `Paid ${formatDate(invoice.paid_at)}`
              : open && invoice.balance_promised_on
                ? `Promised ${formatDate(invoice.balance_promised_on)}`
                : open && invoice.due_date
                  ? `Due ${formatDate(invoice.due_date)}`
                  : `Raised ${formatDate(invoice.created_at)}`}
        </p>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        {open && invoice.balance_cents > 0 && (
          <Link
            href={`/money/offline/${invoice.id}?pay=1`}
            className="inline-flex min-h-10 items-center gap-1 rounded-full border-[1.5px] border-ink px-3 py-1 text-xs font-semibold text-ink no-underline hover:bg-ink hover:text-paper"
            aria-label={`Record a payment on ${invoice.number}`}
          >
            <BanknotesIcon className="h-3.5 w-3.5" aria-hidden />
            Record payment
          </Link>
        )}
        <button
          type="button"
          onClick={pdf}
          disabled={busy}
          className="inline-flex min-h-10 items-center gap-1 rounded-full border-[1.5px] border-line px-3 py-1 text-xs font-semibold hover:border-ink disabled:opacity-50"
          aria-label={`Download ${invoice.number} as a PDF`}
        >
          <ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden />
          {busy ? '…' : 'PDF'}
        </button>
      </div>
    </li>
  );
}
