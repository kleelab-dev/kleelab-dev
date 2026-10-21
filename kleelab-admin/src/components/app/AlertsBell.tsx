'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { BellIcon } from '@heroicons/react/24/outline';
import { errorText } from '@/components/project/format';
import { Skeleton } from '@/components/ui/States';
import { useWhileVisible } from '@/lib/useWhileVisible';
import { apiService } from '@/services/api';
import type { AlertItem, AlertList } from '@/types/api';

const REFRESH_MS = 30_000;
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** The API sends UTC times without a zone; read them as UTC, not local time. */
function parseTime(iso: string): Date {
  return new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(iso) ? iso : `${iso}Z`);
}

function since(iso: string): string {
  const date = parseTime(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (Number.isNaN(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return DATE.format(date);
}

function alertHref(alert: AlertItem): string {
  if (alert.subject_type === 'lead' && alert.subject_id) return `/leads/${alert.subject_id}`;
  if (alert.project_id) return `/projects/${alert.project_id}`;
  return '/activity';
}

function where(alert: AlertItem): string {
  if (alert.project_reference) return `${alert.project_reference} · ${alert.project_title}`;
  if (alert.action === 'lead.create') return 'New enquiry';
  return '';
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * The bell in the header: what clients did since you last looked (messages,
 * sign-offs, requests, files) and new enquiries. Opening it marks them read,
 * on the server, so the count is the same on every device.
 */
export function AlertsBell() {
  const [data, setData] = useState<AlertList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const refresh = useCallback(() => {
    apiService
      .adminAlerts()
      .then((list) => {
        setData(list);
        setError(null);
      })
      .catch((reason) => setError(errorText(reason, 'We could not load your alerts.')));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, attempt]);

  useWhileVisible(refresh, REFRESH_MS);

  // Close on outside clicks and Escape, like the account menu.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Count everything so far as read. `clear` also drops the highlight on the ones showing. */
  function markSeen(clear: boolean) {
    setData((current) => current && { ...current, unread: 0, items: clear ? current.items.map((a) => ({ ...a, unread: false })) : current.items });
    apiService.adminMarkAlertsSeen().catch(() => undefined);
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    // Fetch first so the list is current, then mark it read. The new ones stay
    // highlighted while the panel is open, so you can still tell which they are.
    apiService
      .adminAlerts()
      .then((list) => {
        setData(list);
        setError(null);
        if (list.unread > 0) markSeen(false);
      })
      .catch((reason) => setError(errorText(reason, 'We could not load your alerts.')));
  }

  const unread = data?.unread ?? 0;
  const count = unread > 99 ? '99+' : String(unread);
  const anyUnread = unread > 0 || Boolean(data?.items.some((a) => a.unread));

  return (
    <div ref={boxRef} className="sm:relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label={unread ? `Alerts, ${unread} unread` : 'Alerts'}
        className={clsx(
          'relative grid h-9 w-9 place-items-center rounded-full border-[1.5px]',
          open ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink hover:border-ink',
        )}
      >
        <BellIcon className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-[1.5px] border-paper bg-danger px-1 font-mono text-[10px] font-semibold leading-none text-white"
            aria-hidden
          >
            {count}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Alerts"
          className="card absolute inset-x-4 top-full z-40 mt-2 flex max-h-[min(32rem,75vh)] flex-col overflow-hidden shadow-block sm:inset-x-auto sm:right-0 sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 border-b-[1.5px] border-line px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-label text-muted">Alerts</p>
            <button
              type="button"
              onClick={() => markSeen(true)}
              disabled={!anyUnread}
              className="text-sm font-semibold text-cobalt disabled:text-muted disabled:opacity-60"
            >
              Mark all as read
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {data === null ? (
              error ? (
                <div className="px-3 py-4 text-sm">
                  <p className="text-danger">{error}</p>
                  <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 font-semibold text-cobalt">
                    Try again
                  </button>
                </div>
              ) : (
                <Skeleton rows={2} card={false} className="p-3" />
              )
            ) : data.items.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="font-semibold">Nothing new</p>
                <p className="mt-1 text-sm text-muted">Client messages, sign-offs, requests, files and new enquiries show up here.</p>
              </div>
            ) : (
              <ul className="grid gap-1">
                {data.items.map((alert) => (
                  <li key={alert.id}>
                    <Link
                      href={alertHref(alert)}
                      onClick={() => setOpen(false)}
                      className={clsx(
                        'flex gap-3 rounded-lg px-3 py-2.5 text-ink no-underline hover:bg-ink/5',
                        alert.unread && 'bg-cobalt-soft hover:bg-cobalt-soft/70',
                      )}
                    >
                      <span
                        className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', alert.unread ? 'bg-cobalt' : 'bg-transparent')}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-sm">
                          {alert.unread && <span className="sr-only">New: </span>}
                          <span className="font-semibold">{alert.actor_name || 'Someone'}</span> {lowerFirst(alert.summary)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {[where(alert), since(alert.created_at)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {data !== null && error && <p className="px-3 py-2 text-xs text-danger">{error}</p>}
          </div>
          <Link
            href="/activity"
            onClick={() => setOpen(false)}
            className="border-t-[1.5px] border-line px-4 py-2.5 text-sm font-semibold text-cobalt no-underline hover:bg-ink/5"
          >
            All activity
          </Link>
        </div>
      )}
    </div>
  );
}