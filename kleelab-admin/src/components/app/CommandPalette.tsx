'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { INVOICE_STATUS, LEAD_STATUS, PROJECT_STATUS, errorText, formatDate, formatMoney } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { SearchResults } from '@/types/api';

type Item = { key: string; group: string; label: string; hint?: string; badge?: string; href: string };

const PAGES: Item[] = [
  { key: 'p-today', group: 'Go to', label: 'Today', href: '/' },
  { key: 'p-projects', group: 'Go to', label: 'Projects', href: '/projects' },
  { key: 'p-new', group: 'Go to', label: 'New project', hint: 'Start one for a client', href: '/projects?new=1' },
  { key: 'p-leads', group: 'Go to', label: 'Enquiries', href: '/leads' },
  { key: 'p-clients', group: 'Go to', label: 'Clients', href: '/clients' },
  { key: 'p-money', group: 'Go to', label: 'Money', hint: 'Invoices and payments', href: '/money' },
  { key: 'p-team', group: 'Go to', label: 'Team', href: '/team' },
  { key: 'p-activity', group: 'Go to', label: 'Activity', hint: 'Who changed what', href: '/activity' },
  { key: 'p-account', group: 'Go to', label: 'Your account', hint: 'Two-step sign-in', href: '/account' },
];

function toItems(results: SearchResults): Item[] {
  return [
    ...results.projects.map((p) => ({
      key: `project-${p.id}`,
      group: 'Projects',
      label: p.title,
      hint: [p.reference, p.client_name].filter(Boolean).join(' · '),
      badge: PROJECT_STATUS[p.status]?.label,
      href: `/projects/${p.id}`,
    })),
    ...results.clients.map((c) => ({
      key: `client-${c.id}`,
      group: 'Clients',
      label: c.name || c.email,
      hint: c.name ? c.email : undefined,
      badge: c.is_active ? undefined : 'Switched off',
      href: `/clients/${c.id}`,
    })),
    ...results.leads.map((l) => ({
      key: `lead-${l.id}`,
      group: 'Enquiries',
      label: l.name || l.email,
      hint: [l.company, l.name ? l.email : null].filter(Boolean).join(' · '),
      badge: LEAD_STATUS[l.status]?.label,
      href: `/leads/${l.id}`,
    })),
    ...results.invoices.map((i) => ({
      key: `invoice-${i.id}`,
      group: 'Invoices',
      label: `${i.number} · ${i.title}`,
      hint: `${formatMoney(i.amount_cents, i.currency)} · ${i.project_reference}`,
      badge: INVOICE_STATUS[i.status]?.label,
      href: `/projects/${i.project_id}`,
    })),
    ...results.team.map((t) => ({
      key: `team-${t.id}`,
      group: 'Team',
      label: t.name || t.email,
      hint: t.name ? `${t.email} · see what they did` : 'See what they did',
      badge: t.is_active ? undefined : 'Switched off',
      href: `/activity?person=${t.id}`,
    })),
    ...results.messages.map((m) => ({
      key: `message-${m.id}`,
      group: 'Messages',
      label: m.snippet,
      hint: [m.project_reference, m.project_title, m.author_name, formatDate(m.created_at)].filter(Boolean).join(' · '),
      badge: m.kind === 'note' ? 'Team note' : undefined,
      href: `/projects/${m.project_id}`,
    })),
  ];
}

/**
 * Ctrl+K / ⌘K: jump to a page, or find a project, client, enquiry, invoice or
 * teammate by name, email or number, or a message by the words in it.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  // Answers are kept with the words they answer, so a slow reply never shows under newer words.
  const [found, setFound] = useState<{ needle: string; items: Item[] } | null>(null);
  const [failed, setFailed] = useState<{ needle: string; message: string } | null>(null);
  const [active, setActive] = useState(0);

  const needle = query.trim();
  const searchable = needle.length >= 2;
  // While a new search runs, the last answer stays on screen rather than flashing empty.
  const results = searchable ? (found?.items ?? null) : null;
  const searching = searchable && found?.needle !== needle && failed?.needle !== needle;
  const error = searchable && failed?.needle === needle ? failed.message : null;
  const pages = useMemo(
    () => (needle ? PAGES.filter((p) => p.label.toLowerCase().includes(needle.toLowerCase())) : PAGES),
    [needle],
  );
  const items = useMemo(() => [...(results ?? []), ...pages], [results, pages]);

  // Give focus back to wherever it was when the palette closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiService
        .adminSearch(needle, controller.signal)
        .then((answer) => {
          setFound({ needle, items: toItems(answer) });
          setActive(0);
        })
        .catch((reason) => !controller.signal.aborted && setFailed({ needle, message: errorText(reason) }));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchable, needle]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function go(item: Item | undefined) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(items[active]);
    } else if (event.key === 'Tab') {
      // Keep focus in the dialog: the input is the only stop.
      event.preventDefault();
    }
  }

  const answered = searchable && found?.needle === needle;
  const nothing = answered && items.length === 0;
  let lastGroup = '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-3 pt-[8vh] sm:pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Search the dashboard" className="card flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden shadow-block" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b-[1.5px] border-line px-4">
          <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search projects, people, invoices, messages…"
            className="min-w-0 flex-1 bg-transparent py-4 text-base outline-none placeholder:text-muted"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${items[active].key}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10px] text-muted sm:inline">Esc</kbd>
        </div>
        <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto py-2">
          {items.map((item, index) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.key} role="presentation">
                {heading && <p className="px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-label text-muted">{heading}</p>}
                <div
                  id={`${listId}-${item.key}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                  className={clsx('mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', index === active && 'bg-cobalt-soft')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    {item.hint && <p className="truncate text-xs text-muted">{item.hint}</p>}
                  </div>
                  {item.badge && <span className="shrink-0 font-mono text-[10px] uppercase tracking-label text-muted">{item.badge}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t-[1.5px] border-line px-4 py-2 text-xs text-muted" aria-live="polite">
          {error
            ? error
            : searching
              ? 'Searching…'
              : nothing
                ? `Nothing found for “${needle}”.`
                : needle.length === 1
                  ? 'Type one more letter to search.'
                  : answered
                    ? '↑ ↓ to choose, Enter to open'
                    : 'Search by name, email, reference, invoice number or words in a message.'}
        </p>
      </div>
    </div>
  );
}
