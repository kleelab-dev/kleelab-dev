'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ArrowDownTrayIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Pill } from '@/components/project/Pill';
import { errorText, formatDate, formatMoney, INVOICE_STATUS, isOverdue, INVOICE_KIND } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { AdminInvoice } from '@/types/api';

/**
 * One invoice as a row: what, who, how much, where it stands, and the actions.
 * Without the client it is laid out to fit a narrower column.
 */
export function InvoiceRow({
  invoice,
  showClient = true,
  onChange,
  onError,
}: {
  invoice: AdminInvoice;
  showClient?: boolean;
  onChange: (invoice: AdminInvoice, message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<'pdf' | 'paid' | null>(null);
  const late = isOverdue(invoice);
  const status = INVOICE_STATUS[invoice.status];

  async function markPaid() {
    if (!window.confirm(`Mark ${invoice.number} as paid? The client gets a thank-you email.`)) return;
    setBusy('paid');
    try {
      const project = await apiService.adminUpdateInvoice(invoice.project_id, invoice.id, { status: 'paid' });
      const saved = project.invoices.find((i) => i.id === invoice.id);
      onChange({ ...invoice, ...saved }, `${invoice.number} marked as paid.`);
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(null);
    }
  }

  async function pdf() {
    setBusy('pdf');
    try {
      await apiService.downloadInvoicePdf(invoice.project_id, invoice);
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li
      className={clsx(
        'gap-x-4 gap-y-2 px-4 py-4 sm:px-5',
        showClient
          ? 'grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_9rem_8.5rem_auto] md:items-center'
          : 'flex flex-wrap items-center',
      )}
    >
      <div className={clsx('min-w-0', !showClient && 'flex-1 basis-56')}>
        <p className="font-mono text-[11px] uppercase tracking-label text-cobalt">
          {invoice.number}
          {invoice.kind && INVOICE_KIND[invoice.kind] && <span className="text-muted"> · {INVOICE_KIND[invoice.kind]}</span>}
        </p>
        <p className="truncate text-sm font-semibold text-ink">{invoice.title}</p>
        {!showClient && (
          <Link href={`/projects/${invoice.project_id}`} className="block truncate text-xs text-muted no-underline hover:text-cobalt">
            {invoice.project_title}
          </Link>
        )}
      </div>
      <div className={clsx('min-w-0 text-sm', !showClient && 'hidden')}>
        {showClient && invoice.client_id ? (
          <Link href={`/clients/${invoice.client_id}`} className="block truncate font-medium text-ink no-underline hover:text-cobalt">
            {invoice.client_name || invoice.client_email}
          </Link>
        ) : null}
        <Link href={`/projects/${invoice.project_id}`} className="block truncate text-muted no-underline hover:text-cobalt">
          {invoice.project_title}
        </Link>
      </div>
      <p className={clsx('font-display text-lg font-extrabold md:text-right', invoice.status === 'cancelled' && 'text-muted line-through')}>
        {formatMoney(invoice.amount_cents, invoice.currency)}
      </p>
      <div className="text-xs">
        <Pill tone={late ? 'bg-danger-soft text-danger' : status.tone}>{late ? 'Overdue' : status.label}</Pill>
        <p className={clsx('mt-1', late ? 'font-medium text-danger' : 'text-muted')}>
          {invoice.status === 'paid' && invoice.paid_at
            ? `Paid ${invoice.paid_via === 'paystack' ? 'online ' : ''}${formatDate(invoice.paid_at)}`
            : invoice.status === 'unpaid'
              ? invoice.due_date
                ? `Due ${formatDate(invoice.due_date)}`
                : `Sent ${formatDate(invoice.created_at)}`
              : `Sent ${formatDate(invoice.created_at)}`}
        </p>
        {invoice.status === 'paid' && invoice.payment_reference && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted" title="Paystack reference">
            Paystack {invoice.payment_reference}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        {invoice.status === 'unpaid' && (
          <button
            type="button"
            onClick={markPaid}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink px-3 py-1 text-xs font-semibold hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            <CheckIcon className="h-3.5 w-3.5" aria-hidden />
            {busy === 'paid' ? 'Saving…' : 'Mark paid'}
          </button>
        )}
        <button
          type="button"
          onClick={pdf}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-line px-3 py-1 text-xs font-semibold hover:border-ink disabled:opacity-50"
          aria-label={`Download ${invoice.number} as a PDF`}
        >
          <ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden />
          {busy === 'pdf' ? '…' : 'PDF'}
        </button>
      </div>
    </li>
  );
}
