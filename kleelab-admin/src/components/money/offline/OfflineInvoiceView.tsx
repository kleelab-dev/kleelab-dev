'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownTrayIcon, BanknotesIcon, EnvelopeIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/project/Pill';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { errorText, formatDate, formatMoney, INVOICE_STATUS, isOverdue, PAYMENT_METHOD, promiseMissed, todayISO, toDateInput } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { OfflineInvoiceDetail, OfflinePayment } from '@/types/api';
import { EmailDocumentDialog } from './EmailDocumentDialog';
import { chipClass, FormError, Notice } from './fields';
import { OfflineInvoiceForm } from './OfflineInvoiceForm';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { ConfirmDialog, VoidDialog } from './VoidDialog';

type Dialog =
  | { kind: 'pay' }
  | { kind: 'cancel' }
  | { kind: 'email' }
  | { kind: 'void'; payment: OfflinePayment }
  | { kind: 'receipt-email'; payment: OfflinePayment };

/** One offline invoice: what is owed, what has been paid, and everything staff can do about it. */
export function OfflineInvoiceView({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const wantsPay = useSearchParams().get('pay') === '1';
  // "Record payment" on a Money row arrives with ?pay=1. It opens the dialog once, on the
  // first load, and the flag leaves the address straight away so a reload does not reopen it.
  const payPending = useRef(wantsPay);
  const [invoice, setInvoice] = useState<OfflineInvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [promise, setPromise] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    apiService
      .adminOfflineInvoice(id)
      .then((found) => {
        if (!current) return;
        setInvoice(found);
        setPromise(toDateInput(found.balance_promised_on));
        if (payPending.current) {
          payPending.current = false;
          router.replace(pathname, { scroll: false });
          if (found.balance_cents > 0 && found.status !== 'cancelled') setDialog((d) => d ?? { kind: 'pay' });
        }
      })
      .catch((reason) => current && setError(errorText(reason)));
    return () => {
      current = false;
    };
  }, [id, attempt, router, pathname]);

  const apply = useCallback((next: OfflineInvoiceDetail) => {
    setInvoice(next);
    setPromise(toDateInput(next.balance_promised_on));
  }, []);

  function closeDialog() {
    setDialog(null);
  }

  async function run(work: () => Promise<OfflineInvoiceDetail>, message?: string) {
    setBusy(true);
    setActionError(null);
    try {
      apply(await work());
      setNotice(message ?? null);
    } catch (reason) {
      setActionError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function download(work: () => Promise<void>) {
    setActionError(null);
    try {
      await work();
    } catch (reason) {
      setActionError(errorText(reason));
    }
  }

  if (error) {
    return (
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tightest">Invoice</h1>
        <ErrorState
          className="mt-4"
          message={error}
          onRetry={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        />
      </div>
    );
  }
  if (!invoice) {
    return (
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tightest">Invoice</h1>
        <Skeleton rows={3} className="mt-4" />
      </div>
    );
  }

  const status = INVOICE_STATUS[invoice.status];
  const money = (cents: number) => formatMoney(cents, invoice.currency);
  const cancelled = invoice.status === 'cancelled';
  const open = invoice.status === 'unpaid' || invoice.status === 'part_paid';
  const hasBalance = invoice.balance_cents > 0 && !cancelled;
  const canEdit = !cancelled && (invoice.editable || hasBalance);
  const hasEmail = Boolean(invoice.contact.email);
  const emailBlock = cancelled ? 'Reopen the invoice first' : !hasEmail ? 'Add an email for this contact first' : null;
  const cancelBlock = invoice.status === 'part_paid' || invoice.status === 'paid' ? 'Void the payments before cancelling' : null;
  const late = isOverdue(invoice);
  const missed = promiseMissed(invoice);
  const figures: { label: string; value: string; warn: boolean }[] = [
    { label: 'Total', value: money(invoice.amount_cents), warn: false },
    { label: 'Paid', value: money(invoice.paid_cents), warn: false },
    { label: 'Balance', value: money(invoice.balance_cents), warn: hasBalance && late },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 [&>*]:min-w-0">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <p className="tag">{invoice.number}</p>
          <Pill tone={status.tone}>{status.label}</Pill>
          <span className="rounded-full bg-ink px-2 py-px font-mono text-[10px] uppercase tracking-label text-paper">Offline</span>
          {missed ? <span className="text-xs font-semibold text-danger">Promise missed</span> : late && <span className="text-xs font-semibold text-danger">Overdue</span>}
        </div>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tightest sm:text-4xl">{invoice.title}</h1>
        <p className="mt-2 text-muted">
          For{' '}
          <Link href={`/money/contacts/${invoice.contact.id}`} className="font-semibold text-ink underline underline-offset-2">
            {invoice.bill_to_name}
          </Link>
          {invoice.bill_to_company ? `, ${invoice.bill_to_company}` : ''} · Due {invoice.due_date ? formatDate(invoice.due_date) : 'on receipt'}
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {figures.map((figure) => (
          <div key={figure.label} className="card p-4">
            <dt className="label">{figure.label}</dt>
            <dd className={`font-display text-xl font-extrabold tracking-tightest sm:text-2xl ${figure.warn ? 'text-danger' : ''}`}>{figure.value}</dd>
          </div>
        ))}
      </dl>

      {notice && <Notice>{notice}</Notice>}
      <FormError message={actionError} />

      <div>
        <div className="flex flex-wrap gap-2">
          {hasBalance && (
            <Button type="button" onClick={() => setDialog({ kind: 'pay' })}>
              <BanknotesIcon className="h-4 w-4" aria-hidden />
              Record payment
            </Button>
          )}
          {canEdit && (
            <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              <PencilSquareIcon className="h-4 w-4" aria-hidden />
              {editing ? 'Close editor' : 'Edit'}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => download(() => apiService.downloadOfflineInvoicePdf(invoice))}>
            <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
            PDF
          </Button>
          <Button type="button" variant="secondary" disabled={Boolean(emailBlock)} aria-describedby={emailBlock ? 'email-hint' : undefined} onClick={() => setDialog({ kind: 'email' })}>
            <EnvelopeIcon className="h-4 w-4" aria-hidden />
            Email
          </Button>
          {cancelled ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => run(() => apiService.adminReopenOfflineInvoice(invoice.id), 'Invoice reopened.')}>
              Reopen
            </Button>
          ) : (
            <Button type="button" variant="danger" disabled={!open || Boolean(cancelBlock)} aria-describedby={cancelBlock ? 'cancel-hint' : undefined} onClick={() => setDialog({ kind: 'cancel' })}>
              Cancel invoice
            </Button>
          )}
        </div>
        {(emailBlock || cancelBlock) && (
          <p className="mt-2 text-xs text-muted">
            {emailBlock && <span id="email-hint">Email: {emailBlock}. </span>}
            {cancelBlock && <span id="cancel-hint">Cancel: {cancelBlock}.</span>}
          </p>
        )}
      </div>

      {editing && (
        <section aria-label="Edit invoice" className="card p-5">
          <OfflineInvoiceForm
            invoice={invoice}
            onCancel={() => setEditing(false)}
            onSaved={(saved) => {
              apply(saved);
              setEditing(false);
              setNotice('Changes saved.');
            }}
          />
        </section>
      )}

      {hasBalance && (
        <section aria-labelledby="promise-h" className="card p-5">
          <h2 id="promise-h" className="font-display text-lg font-extrabold tracking-tightest">
            Balance promised by
          </h2>
          <p className="mt-1 text-sm text-muted">When the client says the rest will arrive. Overdue is counted from this date when it is set.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="promise" className="label">
                Date
              </label>
              <input id="promise" type="date" value={promise} min="2000-01-01" onChange={(e) => setPromise(e.target.value)} className="field" />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busy || promise === toDateInput(invoice.balance_promised_on)}
              onClick={() => run(() => apiService.adminUpdateOfflineInvoice(invoice.id, { balance_promised_on: promise || null }), promise ? 'Promised date saved.' : 'Promised date cleared.')}
            >
              Save date
            </Button>
            {invoice.balance_promised_on && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run(() => apiService.adminUpdateOfflineInvoice(invoice.id, { balance_promised_on: null }), 'Promised date cleared.')}>
                Clear
              </Button>
            )}
          </div>
          {missed && <p className="mt-2 text-sm font-semibold text-danger">That date has passed and the balance is still open. Today is {formatDate(todayISO())}.</p>}
        </section>
      )}

      <section aria-labelledby="billto-h" className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 id="billto-h" className="label">
            Bill to
          </h2>
          <address className="text-sm not-italic leading-relaxed text-ink-soft">
            <span className="block font-semibold text-ink">{invoice.bill_to_name}</span>
            {[invoice.bill_to_company, invoice.bill_to_email, invoice.bill_to_phone, invoice.bill_to_address].filter(Boolean).map((line) => (
              <span key={line} className="block whitespace-pre-line">
                {line}
              </span>
            ))}
          </address>
        </div>
        {invoice.notes && (
          <div>
            <h2 className="label">Notes</h2>
            <p className="whitespace-pre-line text-sm text-ink-soft">{invoice.notes}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="lines-h">
        <h2 id="lines-h" className="font-display text-lg font-extrabold tracking-tightest">
          Lines
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-label text-muted">
              <tr>
                <th className="py-2 pr-3 font-normal">Description</th>
                <th className="px-3 py-2 text-right font-normal">Qty</th>
                <th className="px-3 py-2 text-right font-normal">Unit price</th>
                <th className="py-2 pl-3 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoice.lines.map((line, index) => (
                <tr key={index}>
                  <td className="py-2 pr-3">{line.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(line.unit_price_cents)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{money(line.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-[1.5px] border-ink font-semibold">
                <td className="py-2 pr-3" colSpan={3}>
                  Total
                </td>
                <td className="py-2 pl-3 text-right tabular-nums">{money(invoice.amount_cents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="payments-h">
        <h2 id="payments-h" className="font-display text-lg font-extrabold tracking-tightest">
          Payments
        </h2>
        {invoice.payments.length === 0 ? (
          <EmptyState title="No payments yet" className="mt-3">
            Each payment you record gets its own receipt.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border-[1.5px] border-line bg-white">
            {invoice.payments.map((payment) => {
              const voided = Boolean(payment.voided_at);
              return (
                <li key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                  <div className={`min-w-0 flex-1 basis-48 ${voided ? 'text-muted line-through' : ''}`}>
                    <p className="font-semibold">
                      {money(payment.amount_cents)} · {PAYMENT_METHOD[payment.method]}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {formatDate(payment.paid_on)}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                      {payment.recorded_by_name ? ` · by ${payment.recorded_by_name}` : ''}
                    </p>
                  </div>
                  {voided && (
                    <p className="w-full text-xs text-danger sm:w-auto">
                      <span className="font-mono uppercase tracking-label">Void</span> · {payment.void_reason}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => download(() => apiService.downloadReceiptPdf({ id: payment.receipt_id, number: payment.receipt_number }))}
                    className={chipClass}
                    aria-label={`Download receipt ${payment.receipt_number}`}
                  >
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden />
                    {payment.receipt_number}
                  </button>
                  {!voided && (
                    <>
                      <button
                        type="button"
                        className={chipClass}
                        disabled={!hasEmail}
                        title={hasEmail ? undefined : 'Add an email for this contact first'}
                        onClick={() => setDialog({ kind: 'receipt-email', payment })}
                        aria-label={`Email receipt ${payment.receipt_number}`}
                      >
                        <EnvelopeIcon className="h-3.5 w-3.5" aria-hidden />
                        Email
                      </button>
                      <button type="button" className={chipClass} onClick={() => setDialog({ kind: 'void', payment })} aria-label={`Void payment ${payment.receipt_number}`}>
                        Void
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {dialog?.kind === 'pay' && (
        <RecordPaymentDialog
          invoice={invoice}
          onClose={closeDialog}
          onRecorded={(next) => {
            apply(next);
            setNotice(null);
          }}
          onEmailReceipt={(payment) => setDialog({ kind: 'receipt-email', payment })}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <ConfirmDialog
          title={`Cancel ${invoice.number}?`}
          body="The invoice is marked cancelled and leaves the totals. Nothing is deleted, and you can reopen it later."
          confirmLabel="Cancel invoice"
          danger
          onClose={closeDialog}
          onConfirm={async () => {
            apply(await apiService.adminCancelOfflineInvoice(invoice.id));
            setNotice('Invoice cancelled.');
            closeDialog();
          }}
        />
      )}
      {dialog?.kind === 'void' && (
        <VoidDialog
          title={`Void ${dialog.payment.receipt_number}?`}
          body={`Voiding keeps the record and marks receipt ${dialog.payment.receipt_number} VOID. The invoice balance goes back up by ${money(dialog.payment.amount_cents)}.`}
          confirmLabel="Void payment"
          onClose={closeDialog}
          onConfirm={async (reason) => {
            apply(await apiService.adminVoidOfflinePayment(invoice.id, dialog.payment.id, reason));
            setNotice(`${dialog.payment.receipt_number} voided.`);
            closeDialog();
          }}
        />
      )}
      {dialog?.kind === 'email' && <EmailDocumentDialog kind="invoice" id={invoice.id} number={invoice.number} defaultTo={invoice.contact.email} onClose={closeDialog} />}
      {dialog?.kind === 'receipt-email' && (
        <EmailDocumentDialog kind="receipt" id={dialog.payment.receipt_id} number={dialog.payment.receipt_number} defaultTo={invoice.contact.email} onClose={closeDialog} />
      )}
    </div>
  );
}
