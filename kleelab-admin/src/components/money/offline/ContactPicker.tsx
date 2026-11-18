'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import { errorText } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { OfflineContact, OfflineContactInput } from '@/types/api';
import { ContactForm } from './ContactForm';

/** Either someone already saved, or someone typed in now and saved with the document. */
export type PickedContact = { kind: 'existing'; contact: OfflineContact } | { kind: 'new'; input: OfflineContactInput };

/** The part of a create request that names the contact. */
export function contactPayload(picked: PickedContact): { contact_id: string } | { contact: OfflineContactInput } {
  return picked.kind === 'existing' ? { contact_id: picked.contact.id } : { contact: picked.input };
}

export function pickedName(picked: PickedContact): string {
  return picked.kind === 'existing' ? picked.contact.name : picked.input.name;
}

/**
 * Search saved contacts, or add a new one in place. Arrow keys move through the
 * matches, Enter picks one and Esc closes the list. Archived contacts are not offered.
 */
export function ContactPicker({
  value,
  onChange,
  error,
  label = 'Contact',
  allowNew = true,
}: {
  value: PickedContact | null;
  onChange: (value: PickedContact | null) => void;
  error?: string | null;
  label?: string;
  /** Off when a pick can only be a saved contact (the edit form sends a contact id). */
  allowNew?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [matches, setMatches] = useState<OfflineContact[] | null>(null);
  // The query the current matches answer, so Enter never acts on stale or missing results.
  const [settled, setSettled] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [attempt, setAttempt] = useState(0);

  // One search a moment after typing stops. Without a query it lists the first few by name.
  useEffect(() => {
    if (!open) return;
    let current = true;
    const timer = setTimeout(
      () => {
        apiService
          .adminOfflineContacts(query)
          .then((list) => {
            if (!current) return;
            setMatches(list);
            setSettled(query);
            setFailure(null);
          })
          .catch((reason) => current && setFailure(errorText(reason)));
      },
      query ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, open, attempt]);

  const shown = (matches ?? []).slice(0, 8);
  // The last option, after the matches, is "New contact".
  const optionCount = shown.length + (allowNew ? 1 : 0);
  const ready = matches !== null && !failure && settled === query;

  function pick(contact: OfflineContact) {
    onChange({ kind: 'existing', contact });
    setOpen(false);
    setQuery('');
  }

  function startAdding() {
    setAdding(true);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((n) => (n + 1) % Math.max(optionCount, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((n) => (n - 1 + optionCount) % Math.max(optionCount, 1));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      // Results still loading (or failed): do nothing, rather than land on "New contact".
      if (!ready) return;
      if (active < shown.length) pick(shown[active]);
      else if (allowNew) startAdding();
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  if (adding) {
    return (
      <div className="rounded-2xl border-[1.5px] border-line bg-white p-4">
        <p className="label">New contact</p>
        <ContactForm
          initial={value?.kind === 'new' ? value.input : { name: query.trim() }}
          submitLabel="Use this contact"
          nested
          onSubmit={(input) => {
            onChange({ kind: 'new', input });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      </div>
    );
  }

  if (value) {
    const details = value.kind === 'existing' ? value.contact : value.input;
    return (
      <div>
        <p className="label">{label}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-[1.5px] border-line bg-white px-4 py-3">
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold text-ink">
              {details.name}
              {value.kind === 'new' && <span className="ml-2 rounded-full bg-sun-soft px-2 py-px font-mono text-[10px] uppercase tracking-label">New, saved with this</span>}
            </p>
            <p className="truncate text-muted">{[details.company, details.email, details.phone].filter(Boolean).join(' · ') || 'No other details'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="inline-flex min-h-10 items-center rounded-full border-[1.5px] border-line px-3 py-1 text-xs font-semibold hover:border-ink"
          >
            Change
          </button>
        </div>
        {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          value={query}
          maxLength={100}
          autoComplete="off"
          placeholder="Search by name, company or email"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
          onKeyDown={onKeyDown}
          className="field pl-9"
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
      {open && (
        <ul id={listId} role="listbox" aria-label="Matching contacts" className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border-[1.5px] border-ink bg-white shadow-block-sm">
          {failure ? (
            <li role="presentation" className="flex flex-wrap items-center gap-2 p-3 text-sm text-danger">
              <span className="min-w-0 flex-1">{failure}</span>
              <button type="button" className="font-semibold underline underline-offset-2" onMouseDown={(e) => e.preventDefault()} onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </li>
          ) : matches === null ? (
            <li role="presentation" className="p-3 text-sm text-muted">
              Searching…
            </li>
          ) : shown.length === 0 ? (
            <li role="presentation" className="p-3 text-sm text-muted">
              {query ? 'Nobody matches that.' : allowNew ? 'No contacts yet. Add the first one below.' : 'No contacts yet.'}
            </li>
          ) : (
            shown.map((contact, index) => (
              <li
                key={contact.id}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={active === index}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(contact)}
                onMouseEnter={() => setActive(index)}
                className={clsx('cursor-pointer px-3 py-2 text-sm', active === index && 'bg-cobalt-soft')}
              >
                <span className="block truncate font-medium text-ink">{contact.name}</span>
                <span className="block truncate text-xs text-muted">{[contact.company, contact.email].filter(Boolean).join(' · ') || 'No other details'}</span>
              </li>
            ))
          )}
          {allowNew && (
          <li
            id={`${id}-opt-${shown.length}`}
            role="option"
            aria-selected={active === shown.length}
            onMouseDown={(e) => e.preventDefault()}
            onClick={startAdding}
            onMouseEnter={() => setActive(shown.length)}
            className={clsx('flex cursor-pointer items-center gap-2 border-t border-line px-3 py-2 text-sm font-semibold text-cobalt', active === shown.length && 'bg-cobalt-soft')}
          >
            <PlusIcon className="h-4 w-4" aria-hidden />
            New contact{query.trim() ? `: ${query.trim()}` : ''}
          </li>
          )}
        </ul>
      )}
    </div>
  );
}
