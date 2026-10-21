'use client';

import { useState } from 'react';
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { Button, buttonClass } from '@/components/ui/Button';
import { apiService } from '@/services/api';
import type { Currency, Invoice, InvoiceStatus, ProjectDetail } from '@/types/api';
import { CURRENCIES, errorText, formatDate, formatMoney, INVOICE_STATUS } from './format';
import { Pill } from './Pill';

function isLate(invoice: Invoice): boolean {
  return invoice.status === 'unpaid' && !!invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10);
}

/** Invoices on a project, newest first. Payment happens on the provider's own page. */
export function InvoiceList({
  invoices,
  projectId,
  renderControls,
}: {
  invoices: Invoice[];
  /** Set to offer each invoice as a PDF. */
  projectId?: string;
  renderControls?: (invoice: Invoice) => React.ReactNode;
}) {
  const ordered = [...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <ul className="grid gap-2">
      {ordered.map((invoice) => {
        const status = INVOICE_STATUS[invoice.status];
        const late = isLate(invoice);
        return (
          <li key={invoice.id} className="rounded-xl border-[1.5px] border-line bg-white p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{invoice.title}</span>
              <Pill tone={late ? 'bg-danger-soft text-danger' : status.tone}>{late ? 'Overdue' : status.label}</Pill>
              {projectId && <PdfButton projectId={projectId} invoice={invoice} />}
            </div>
            <p className="mt-1 font-display text-2xl font-extrabold">{formatMoney(invoice.amount_cents, invoice.currency)}</p>
            <p className="text-xs text-muted">
              {invoice.number}
              {invoice.status === 'paid' && invoice.paid_at
                ? ` · Paid ${formatDate(invoice.paid_at)}`
                : invoice.due_date
                  ? ` · Due ${formatDate(invoice.due_date)}`
                  : ''}
            </p>
            {renderControls ? (
              <div className="mt-3">{renderControls(invoice)}</div>
            ) : (
              invoice.status === 'unpaid' &&
              invoice.pay_url && (
                <a href={invoice.pay_url} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'sm', 'mt-3')}>
                  Pay now <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </a>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PdfButton({ projectId, invoice }: { projectId: string; invoice: Invoice }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  return (
    <button
      type="button"
      disabled={state === 'busy'}
      onClick={() => {
        setState('busy');
        apiService
          .downloadInvoicePdf(projectId, invoice)
          .then(() => setState('idle'))
          .catch(() => setState('failed'));
      }}
      className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-cobalt hover:text-cobalt-dark disabled:opacity-50"
    >
      <ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden />
      {state === 'busy' ? 'Preparing…' : state === 'failed' ? 'Try again' : 'PDF'}
    </button>
  );
}

/** The team's side: send an invoice, then mark it paid or cancel it. */
export function AdminInvoices({ project, onChange }: { project: ProjectDetail; onChange: (project: ProjectDetail) => void }) {
  const blank = { title: '', amount: '', currency: 'USD' as Currency, due_date: '', pay_url: '' };
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(project.invoices.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Math.round(Number(form.amount.replace(/,/g, '')) * 100);
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Add what the invoice is for and an amount above zero.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(
        await apiService.adminCreateInvoice(project.id, {
          title: form.title.trim(),
          amount_cents: amount,
          currency: form.currency,
          due_date: form.due_date || null,
          pay_url: form.pay_url.trim() || null,
        }),
      );
      setForm({ ...blank, currency: form.currency });
      setOpen(false);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(invoice: Invoice, status: InvoiceStatus) {
    if (status === 'cancelled' && !window.confirm(`Cancel ${invoice.number}? The client will no longer see a payment button.`)) return;
    setError(null);
    try {
      onChange(await apiService.adminUpdateInvoice(project.id, invoice.id, { status }));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return (
    <div>
      {project.invoices.length > 0 && (
        <InvoiceList
          invoices={project.invoices}
          projectId={project.id}
          renderControls={(invoice) =>
            invoice.status === 'unpaid' ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setStatus(invoice, 'paid')}>Mark as paid</Button>
                <Button size="sm" variant="ghost" onClick={() => setStatus(invoice, 'cancelled')}>Cancel invoice</Button>
                {invoice.pay_url && (
                  <a href={invoice.pay_url} target="_blank" rel="noopener noreferrer" className="self-center text-xs font-semibold text-cobalt">
                    Payment link
                  </a>
                )}
              </div>
            ) : invoice.status === 'paid' ? (
              <button type="button" onClick={() => setStatus(invoice, 'unpaid')} className="text-xs text-muted hover:text-ink">
                Marked by mistake? Set back to unpaid
              </button>
            ) : null
          }
        />
      )}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {open ? (
        <form onSubmit={create} className={project.invoices.length ? 'mt-5 grid gap-3 border-t border-line pt-5' : 'grid gap-3'}>
          <div>
            <label htmlFor="inv-title" className="label">What it is for</label>
            <input id="inv-title" value={form.title} onChange={set('title')} className="field" placeholder="Deposit, 50% of the build" />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label htmlFor="inv-amount" className="label">Amount</label>
              <input id="inv-amount" inputMode="decimal" value={form.amount} onChange={set('amount')} className="field" placeholder="2500" />
            </div>
            <div>
              <label htmlFor="inv-currency" className="label">Currency</label>
              <select id="inv-currency" value={form.currency} onChange={set('currency')} className="field">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="inv-due" className="label">Pay by (optional)</label>
            <input id="inv-due" type="date" value={form.due_date} onChange={set('due_date')} className="field" />
          </div>
          <div>
            <label htmlFor="inv-url" className="label">Payment link (Stripe or Paystack)</label>
            <input id="inv-url" type="url" value={form.pay_url} onChange={set('pay_url')} className="field" placeholder="https://" />
            <p className="mt-1 text-xs text-muted">The client sees a Pay now button that opens this link. Leave it empty for a bank transfer.</p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>{busy ? 'Sending…' : 'Send invoice'}</Button>
            {project.invoices.length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            )}
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => setOpen(true)}>New invoice</Button>
      )}
    </div>
  );
}
