'use client';

import { useEffect, useState } from 'react';
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import { buttonClass } from '@/components/ui/Button';
import { apiService } from '@/services/api';
import type { Invoice, PaymentsConfig } from '@/types/api';
import { errorText, formatDate, formatMoney, INVOICE_STATUS } from './format';
import { Pill } from './Pill';

// Asked once per page load: whether card payment is on does not change while
// someone is looking at their invoices.
let configRequest: Promise<PaymentsConfig | null> | null = null;

function loadPaymentsConfig(): Promise<PaymentsConfig | null> {
  if (!configRequest) {
    configRequest = apiService.getPaymentsConfig().catch(() => {
      configRequest = null;
      return null;
    });
  }
  return configRequest;
}

function usePaymentsConfig(): PaymentsConfig | null {
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  useEffect(() => {
    let active = true;
    loadPaymentsConfig().then((loaded) => {
      if (active) setConfig(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return config;
}

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
  const payments = usePaymentsConfig();
  const canPayOnline = (invoice: Invoice) =>
    !!payments?.enabled && invoice.status === 'unpaid' && payments.currencies.includes(invoice.currency);
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
                ? ` · Paid ${invoice.paid_via === 'paystack' ? 'online ' : ''}${formatDate(invoice.paid_at)}`
                : invoice.due_date
                  ? ` · Due ${formatDate(invoice.due_date)}`
                  : ''}
            </p>
            {renderControls ? (
              <div className="mt-3">{renderControls(invoice)}</div>
            ) : canPayOnline(invoice) ? (
              <PayButton invoice={invoice} testMode={!!payments?.test_mode} />
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

/** Card payment through Paystack. The browser leaves for Paystack's page and comes back to /dashboard/payment. */
function PayButton({ invoice, testMode }: { invoice: Invoice; testMode: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          apiService
            .startInvoicePayment(invoice.id)
            .then(({ authorization_url }) => window.location.assign(authorization_url))
            .catch((reason) => {
              setBusy(false);
              setError(errorText(reason, 'We could not start the payment. Please try again.'));
            });
        }}
        className={buttonClass('primary', 'sm')}
      >
        <CreditCardIcon className="h-4 w-4" aria-hidden />
        {busy ? 'Opening payment…' : 'Pay now'}
      </button>
      {testMode && <p className="mt-1.5 text-xs text-muted">Test mode: no real money is taken.</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
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
      className="-my-2 ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-semibold text-cobalt hover:bg-cobalt/5 hover:text-cobalt-dark disabled:opacity-50"
    >
      <ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden />
      {state === 'busy' ? 'Preparing…' : state === 'failed' ? 'Try again' : 'PDF'}
    </button>
  );
}
