'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { CheckIcon } from '@heroicons/react/24/outline';
import type { ChecklistItem } from '@/types/api';
import { errorText, timeAgo } from './format';

/**
 * Getting started: what the team needs from the client before work begins.
 * Ticking says "done" (the thing itself goes in Files or a message); a note can go with it.
 */
export function Checklist({
  items,
  onTick,
}: {
  items: ChecklistItem[];
  onTick: (itemId: string, done: boolean, note?: string | null) => Promise<void>;
}) {
  const done = items.filter((i) => i.done_at).length;
  return (
    <div>
      <p className="text-sm leading-6 text-muted">
        Tick each one off when you have sent it, by adding it under Files or in a message. Not sure? Tick it with a note
        and we will ask.
      </p>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-label text-muted">
        {done} of {items.length} in
      </p>
      <ul className="mt-3 grid gap-2">
        {items.map((item) => (
          <ChecklistRow key={item.id} item={item} onTick={onTick} />
        ))}
      </ul>
    </div>
  );
}

function ChecklistRow({ item, onTick }: { item: ChecklistItem; onTick: (itemId: string, done: boolean, note?: string | null) => Promise<void> }) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticked = Boolean(item.done_at);

  async function tick(next: boolean, withNote?: string) {
    setBusy(true);
    setError(null);
    try {
      await onTick(item.id, next, withNote?.trim() || null);
      setNoting(false);
      setNote('');
    } catch (reason) {
      setError(errorText(reason, 'That did not save. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={clsx('rounded-xl border-[1.5px] p-3', ticked ? 'border-line bg-paper' : 'border-ink bg-white')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={ticked}
          aria-label={ticked ? `Mark “${item.title}” as not done` : `Mark “${item.title}” as done`}
          disabled={busy}
          onClick={() => tick(!ticked)}
          className={clsx(
            'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-[1.5px] border-ink transition-colors disabled:opacity-50',
            ticked ? 'bg-mint' : 'bg-white hover:bg-sun-soft',
          )}
        >
          {ticked && <CheckIcon className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={clsx('font-semibold leading-6', ticked && 'text-muted line-through decoration-1')}>{item.title}</p>
          {item.description && !ticked && <p className="mt-0.5 text-sm leading-6 text-muted">{item.description}</p>}
          {ticked && (
            <p className="text-xs text-muted">
              Done {timeAgo(item.done_at)}
              {item.done_by_name ? ` by ${item.done_by_name}` : ''}
            </p>
          )}
          {item.note && <p className="mt-1 rounded-lg bg-sun-soft px-2.5 py-1.5 text-sm">{item.note}</p>}
          {!ticked && !noting && (
            <button type="button" onClick={() => setNoting(true)} className="mt-1 text-sm font-semibold text-cobalt underline-offset-4 hover:underline">
              Tick with a note
            </button>
          )}
          {noting && (
            <div className="mt-2 grid gap-2">
              <label htmlFor={`note-${item.id}`} className="sr-only">Note for the team</label>
              <textarea
                id={`note-${item.id}`}
                rows={2}
                maxLength={1000}
                autoFocus
                className="field resize-y text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. the photos are on our Google Drive, I have shared it with you"
              />
              <div className="flex gap-3 text-sm">
                <button type="button" disabled={busy} onClick={() => tick(true, note)} className="rounded-full bg-cobalt px-3.5 py-1.5 font-semibold text-white hover:bg-cobalt-dark disabled:opacity-50">
                  {busy ? 'Saving…' : 'Tick it off'}
                </button>
                <button type="button" disabled={busy} onClick={() => { setNoting(false); setNote(''); }} className="font-semibold text-muted">
                  Never mind
                </button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      </div>
    </li>
  );
}
