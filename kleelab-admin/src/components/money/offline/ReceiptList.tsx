'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { ArrowDownTrayIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { buttonClass } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { errorText, formatDate, formatMoney, PAYMENT_METHOD } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { OfflineReceipt, ReceiptKind } from '@/types/api';
import { EmailDocumentDialog } from './EmailDocumentDialog';
import { chipClass, FormError, Notice } from './fields';
import { VoidDialog } from './VoidDialog';

type Kind = 'all' | ReceiptKind;

const KINDS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'payment', label: 'From invoices' },
  { value: 'standalone', label: 'Direct' },
];

const PAGE = 50;
/** The most the server sends in one go, newest first. */
const SERVER_CAP = 200;

/**
 * Every receipt, newest first. Receipts for invoice payments and direct ones sit
 * together; voided ones are hidden until asked for. Voiding a receipt for an
 * invoice payment voids that payment too, and the invoice balance goes back up.
 */
export function ReceiptList({ contactId }: { contactId?: string } = {}) {
  const created = useSearchParams().get('created');
  const [kind, setKind] = useState<Kind>('all');
  const [showVoided, setShowVoided] = useState(false);
  const [receipts, setReceipts] = useState<OfflineReceipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [attempt, setAttempt] = useState(0);
  const [voiding, setVoiding] = useState<OfflineReceipt | null>(null);
  const [emailing, setEmailing] = useState<OfflineReceipt | null>(null);

  useEffect(() => {
    let current = true;
    apiService
      .adminOfflineReceipts({ kind: kind === 'all' ? undefined : kind, voided: showVoided ? undefined : false })
      .then((list) => {
        if (!current) return;
        setReceipts(list);
        setError(null);
      })
      .catch((reason) => current && setError(errorText(reason)));
    return () => {
      current = false;
    };
  }, [kind, showVoided, attempt]);

  function reload() {
    setReceipts(null);
    setError(null);
    setAttempt((n) => n + 1);
  }

  async function pdf(receipt: OfflineReceipt) {
    setActionError(null);
    try {
      await apiService.downloadReceiptPdf(receipt);
    } catch (reason) {
      setActionError(errorText(reason));
    }
  }

  const justMade = created ? receipts?.find((r) => r.id === created) : undefined;
  const shown = (receipts ?? []).filter((r) => !contactId || r.contact_id === contactId);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of receipt">
          {KINDS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                setReceipts(null);
                setLimit(PAGE);
              }}
              className={clsx('inline-flex min-h-10 items-center rounded-full px-3.5 py-1.5 text-sm', kind === value ? 'bg-ink text-paper' : 'border-[1.5px] border-line bg-white hover:border-ink')}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(e) => {
              setShowVoided(e.target.checked);
              setReceipts(null);
              setLimit(PAGE);
            }}
            className="h-4 w-4 accent-cobalt"
          />
          Show voided
        </label>
      </div>

      {created && justMade && (
        <Notice className="mt-4">
          Recorded. Receipt {justMade.number} is ready.
          <button type="button" onClick={() => pdf(justMade)} className="font-semibold underline underline-offset-2">
            Download PDF
          </button>
        </Notice>
      )}
      {notice && <Notice className="mt-4">{notice}</Notice>}
      {actionError && <div className="mt-4"><FormError message={actionError} /></div>}

      <div className="mt-4">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : receipts === null ? (
          <Skeleton rows={4} />
        ) : shown.length === 0 ? (
          <EmptyState
            title={showVoided || kind !== 'all' ? 'No receipts match' : 'No receipts yet'}
            action={
              <Link href={contactId ? `/money/receipts/new?contact=${encodeURIComponent(contactId)}` : '/money/receipts/new'} className={buttonClass('primary', 'sm')}>
                Record receipt
              </Link>
            }
          >
            Receipts appear here when a payment is recorded on an invoice, or when you record money taken with no invoice.
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-line rounded-2xl border-[1.5px] border-line bg-white">
              {shown.slice(0, limit).map((receipt) => {
                const voided = Boolean(receipt.voided_at);
                return (
                  <li key={receipt.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                    <div className={clsx('min-w-0 flex-1 basis-56', voided && 'text-muted')}>
                      <p className={clsx('font-semibold', voided && 'line-through')}>
                        {receipt.number}
                        {voided && <span className="ml-2 rounded-full bg-danger-soft px-2 py-px font-mono text-[10px] uppercase tracking-label text-danger no-underline">Void</span>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        <Link href={`/money/contacts/${receipt.contact_id}`} className="text-ink underline underline-offset-2">
                          {receipt.bill_to_name}
                        </Link>
                        {receipt.invoice_id && receipt.invoice_number ? (
                          <>
                            {' · '}
                            <Link href={`/money/offline/${receipt.invoice_id}`} className="text-ink underline underline-offset-2">
                              {receipt.invoice_number}
                            </Link>
                          </>
                        ) : (
                          ' · Direct'
                        )}
                      </p>
                      {voided && receipt.void_reason && <p className="text-xs text-danger">{receipt.void_reason}</p>}
                    </div>
                    <p className="text-xs text-muted">
                      {PAYMENT_METHOD[receipt.method]} · {formatDate(receipt.received_on)}
                    </p>
                    <p className={clsx('w-28 text-right font-semibold tabular-nums', voided && 'line-through')}>{formatMoney(receipt.amount_cents, receipt.currency)}</p>
                    <div className="flex gap-2">
                      <button type="button" className={chipClass} onClick={() => pdf(receipt)} aria-label={`Download receipt ${receipt.number}`}>
                        <ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden />
                        PDF
                      </button>
                      {!voided && (
                        <button
                          type="button"
                          className={chipClass}
                          disabled={!receipt.bill_to_email}
                          title={receipt.bill_to_email ? undefined : 'Add an email for this contact first'}
                          onClick={() => setEmailing(receipt)}
                          aria-label={receipt.bill_to_email ? `Email receipt ${receipt.number}` : `Email receipt ${receipt.number} (add an email for this contact first)`}
                        >
                          <EnvelopeIcon className="h-3.5 w-3.5" aria-hidden />
                          Email
                        </button>
                      )}
                      {!voided && (
                        <button type="button" className={chipClass} onClick={() => setVoiding(receipt)} aria-label={`Void receipt ${receipt.number}`}>
                          Void
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {receipts.length >= SERVER_CAP && (
              <p className="mt-3 text-xs text-muted">Showing the newest {SERVER_CAP} receipts. Open a contact to see everything for them.</p>
            )}
            {shown.length > limit && (
              <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
                <span>
                  Showing {limit} of {shown.length}
                </span>
                <button type="button" className={chipClass} onClick={() => setLimit((n) => n + PAGE)}>
                  Show more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {emailing && <EmailDocumentDialog kind="receipt" id={emailing.id} number={emailing.number} defaultTo={emailing.bill_to_email} onClose={() => setEmailing(null)} />}
      {voiding && (
        <VoidDialog
          title={`Void ${voiding.number}?`}
          body={
            voiding.kind === 'payment'
              ? `Voiding keeps the record and marks receipt ${voiding.number} VOID. The payment is voided too, so the balance of ${voiding.invoice_number ?? 'the invoice'} goes back up by ${formatMoney(voiding.amount_cents, voiding.currency)}.`
              : `Voiding keeps the record and marks receipt ${voiding.number} VOID. The ${formatMoney(voiding.amount_cents, voiding.currency)} no longer counts as money received.`
          }
          confirmLabel="Void receipt"
          onClose={() => setVoiding(null)}
          onConfirm={async (reason) => {
            const done = await apiService.adminVoidReceipt(voiding.id, reason);
            setNotice(`${done.number} voided.`);
            setVoiding(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
