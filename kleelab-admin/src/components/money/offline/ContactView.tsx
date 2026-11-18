'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownTrayIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/project/Pill';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { errorText, formatDate, formatMoney, INVOICE_STATUS, PAYMENT_METHOD } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { OfflineContactDetail } from '@/types/api';
import { MoneyTabs } from '../MoneyTabs';
import { ContactForm } from './ContactForm';
import { chipClass, FormError, Notice } from './fields';
import { ConfirmDialog } from './VoidDialog';

/** One contact: their details, every invoice with what is still owed, and their receipts. */
export function ContactView({ id }: { id: string }) {
  const router = useRouter();
  const [contact, setContact] = useState<OfflineContactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    apiService
      .adminOfflineContact(id)
      .then((found) => current && setContact(found))
      .catch((reason) => current && setError(errorText(reason)));
    return () => {
      current = false;
    };
  }, [id, attempt]);

  if (error) {
    return (
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tightest">Contact</h1>
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
  if (!contact) {
    return (
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tightest">Contact</h1>
        <Skeleton rows={3} className="mt-4" />
      </div>
    );
  }

  const archived = Boolean(contact.archived_at);
  // Only someone with no paperwork can be deleted; the server checks this too.
  const deletable = contact.invoices.length === 0 && contact.receipts.length === 0;

  async function pdf(receipt: { id: string; number: string }) {
    setActionError(null);
    try {
      await apiService.downloadReceiptPdf(receipt);
    } catch (reason) {
      setActionError(errorText(reason));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="tag">contact</p>
          <h1 className="mt-2 break-words font-display text-3xl font-extrabold tracking-tightest sm:text-4xl">{contact.name}</h1>
          <p className="mt-2 text-muted">{[contact.company, contact.email, contact.phone].filter(Boolean).join(' · ') || 'No other details'}</p>
          {contact.address && <p className="mt-1 whitespace-pre-line text-sm text-muted">{contact.address}</p>}
          {archived && <p className="mt-2 text-sm font-semibold text-danger">Archived. Archived contacts are not offered when raising an invoice.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            <PencilSquareIcon className="h-4 w-4" aria-hidden />
            {editing ? 'Close editor' : 'Edit'}
          </Button>
          <Button type="button" variant={archived ? 'secondary' : 'danger'} size="sm" onClick={() => setArchiving(true)}>
            {archived ? 'Restore' : 'Archive'}
          </Button>
          {deletable && (
            <Button type="button" variant="danger" size="sm" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      <MoneyTabs contactId={archived ? undefined : contact.id} />

      <div className="mt-6 grid gap-8">
        {notice && <Notice>{notice}</Notice>}
        <FormError message={actionError} />

        {editing && (
          <section aria-label="Edit contact" className="card p-5">
            <ContactForm
              autoFocus
              initial={contact}
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                const saved = await apiService.adminUpdateOfflineContact(contact.id, values);
                setContact({ ...contact, ...saved });
                setEditing(false);
                setNotice('Contact saved. Invoices already issued keep the details they were issued with.');
              }}
            />
          </section>
        )}

        <section aria-labelledby="inv-h">
          <h2 id="inv-h" className="font-display text-lg font-extrabold tracking-tightest">
            Invoices
          </h2>
          {contact.invoices.length === 0 ? (
            <EmptyState title="No invoices yet" className="mt-3">
              Raise one from New invoice above.
            </EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-2xl border-[1.5px] border-line bg-white">
              {contact.invoices.map((invoice) => {
                const status = INVOICE_STATUS[invoice.status];
                return (
                  <li key={invoice.id}>
                    <Link href={`/money/offline/${invoice.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm no-underline hover:bg-ink/5">
                      <span className="min-w-0 flex-1 basis-56">
                        <span className="block truncate font-semibold text-ink">
                          {invoice.number} · {invoice.title}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDate(invoice.created_at)} · Due {invoice.due_date ? formatDate(invoice.due_date) : 'on receipt'}
                        </span>
                      </span>
                      <Pill tone={status.tone}>{status.label}</Pill>
                      <span className="w-full text-left tabular-nums text-ink sm:w-40 sm:text-right">
                        {formatMoney(invoice.amount_cents, invoice.currency)}
                        {invoice.status !== 'cancelled' && invoice.balance_cents > 0 && (
                          <span className="block text-xs text-muted">{formatMoney(invoice.balance_cents, invoice.currency)} left</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="rec-h">
          <h2 id="rec-h" className="font-display text-lg font-extrabold tracking-tightest">
            Receipts
          </h2>
          {contact.receipts.length === 0 ? (
            <EmptyState title="No receipts yet" className="mt-3">
              A receipt is made each time a payment is recorded.
            </EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-2xl border-[1.5px] border-line bg-white">
              {contact.receipts.map((receipt) => {
                const voided = Boolean(receipt.voided_at);
                return (
                  <li key={receipt.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                    <div className={`min-w-0 flex-1 basis-56 ${voided ? 'text-muted' : ''}`}>
                      <p className={`font-semibold ${voided ? 'line-through' : ''}`}>
                        {receipt.number}
                        {voided && <span className="ml-2 rounded-full bg-danger-soft px-2 py-px font-mono text-[10px] uppercase tracking-label text-danger">Void</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {PAYMENT_METHOD[receipt.method]} · {formatDate(receipt.received_on)}
                        {receipt.invoice_id && receipt.invoice_number ? ' · ' : ' · Direct'}
                        {receipt.invoice_id && receipt.invoice_number && (
                          <Link href={`/money/offline/${receipt.invoice_id}`} className="text-ink underline underline-offset-2">
                            {receipt.invoice_number}
                          </Link>
                        )}
                      </p>
                    </div>
                    <p className={`w-28 text-right font-semibold tabular-nums ${voided ? 'line-through' : ''}`}>{formatMoney(receipt.amount_cents, receipt.currency)}</p>
                    <button type="button" className={chipClass} onClick={() => pdf(receipt)} aria-label={`Download receipt ${receipt.number}`}>
                      <ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden />
                      PDF
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {deleting && (
        <ConfirmDialog
          title={`Delete ${contact.name}?`}
          body="This removes the contact for good and cannot be undone. They have no invoices or receipts, so nothing else changes. To keep them on file but stop offering them, archive them instead."
          confirmLabel="Delete contact"
          danger
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await apiService.adminDeleteOfflineContact(contact.id);
            router.push('/money/contacts');
          }}
        />
      )}

      {archiving && (
        <ConfirmDialog
          title={archived ? `Restore ${contact.name}?` : `Archive ${contact.name}?`}
          body={
            archived
              ? 'They are offered again when you raise an invoice or a receipt.'
              : 'They are no longer offered when you raise an invoice or a receipt. Their invoices and receipts stay as they are, and you can restore them later.'
          }
          confirmLabel={archived ? 'Restore' : 'Archive'}
          danger={!archived}
          onClose={() => setArchiving(false)}
          onConfirm={async () => {
            const saved = await apiService.adminUpdateOfflineContact(contact.id, { archived: !archived });
            setContact({ ...contact, ...saved });
            setNotice(archived ? 'Contact restored.' : 'Contact archived.');
            setArchiving(false);
          }}
        />
      )}
    </div>
  );
}
