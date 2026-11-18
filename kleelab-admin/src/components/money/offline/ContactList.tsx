'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { errorText } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { OfflineContact } from '@/types/api';

const LIMIT = 200;

/** Everyone invoices and receipts have been made out to. Search is done by the server. */
export function ContactList() {
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [contacts, setContacts] = useState<OfflineContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // One search a moment after typing stops.
  useEffect(() => {
    let current = true;
    const timer = setTimeout(
      () => {
        apiService
          .adminOfflineContacts(query, archived)
          .then((list) => {
            if (!current) return;
            setContacts(list);
            setError(null);
          })
          .catch((reason) => current && setError(errorText(reason)));
      },
      query ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, archived, attempt]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Search contacts</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} placeholder="Name, company or email" className="field py-2 pl-9 text-sm" />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setContacts(null);
            }}
            className="h-4 w-4 accent-cobalt"
          />
          Show archived
        </label>
      </div>

      <div className="mt-4">
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          />
        ) : contacts === null ? (
          <Skeleton rows={4} />
        ) : contacts.length === 0 ? (
          <EmptyState title={query || archived ? 'No contacts match' : 'No contacts yet'}>
            {query || archived ? 'Try a different search.' : 'No contacts yet. They are saved when you raise an invoice.'}
          </EmptyState>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted" aria-live="polite">
              {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
              {archived ? ' (archived)' : ''}
            </p>
            <ul className="divide-y divide-line rounded-2xl border-[1.5px] border-line bg-white">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <Link href={`/money/contacts/${contact.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm no-underline hover:bg-ink/5">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block truncate font-semibold text-ink">{contact.name}</span>
                      <span className="block truncate text-xs text-muted">{[contact.company, contact.email].filter(Boolean).join(' · ') || 'No other details'}</span>
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-label text-muted">
                      {contact.invoice_count} {contact.invoice_count === 1 ? 'invoice' : 'invoices'} · {contact.receipt_count} {contact.receipt_count === 1 ? 'receipt' : 'receipts'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {contacts.length >= LIMIT && <p className="mt-3 text-sm text-muted">Showing the first {LIMIT}. Search to narrow the list.</p>}
          </>
        )}
      </div>
    </div>
  );
}
