'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { CheckIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { apiService } from '@/services/api';
import type { ChecklistItem, ProjectDetail } from '@/types/api';
import { timeAgo } from './format';

type Save = (work: () => Promise<ProjectDetail>) => Promise<void>;

/**
 * Getting started: what the client has to send before work begins. The client
 * ticks items off; the team can too (when it came by email), and shapes the list.
 */
export function ChecklistEditor({ project, save }: { project: ProjectDetail; save: Save }) {
  const items = project.checklist;
  const done = items.filter((i) => i.done_at).length;

  return (
    <div>
      {items.length ? (
        <>
          <p className="font-mono text-[10px] uppercase tracking-label text-muted">
            {done} of {items.length} in{done === items.length ? ' · all done' : ''}
          </p>
          <ul className="mt-3 grid gap-2">
            {items.map((item) => (
              <Row key={item.id} project={project} item={item} save={save} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">Nothing asked of the client yet.</p>
      )}
      <AddItem project={project} save={save} />
      <p className="mt-3 text-xs text-muted">
        The client sees this list on their project page. When they tick the last one, the team gets an email.
      </p>
    </div>
  );
}

function Row({ project, item, save }: { project: ProjectDetail; item: ChecklistItem; save: Save }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const ticked = Boolean(item.done_at);
  const icon = 'grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-line bg-white hover:border-ink';

  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    await save(() => apiService.adminUpdateChecklistItem(project.id, item.id, { title: title.trim(), description: description.trim() || null }));
    setEditing(false);
  }

  if (editing) {
    return (
      <li>
        <form onSubmit={rename} className="grid gap-2 rounded-xl border-[1.5px] border-line bg-paper p-3">
          <div>
            <label htmlFor={`ct-${item.id}`} className="label">What you need</label>
            <input id={`ct-${item.id}`} value={title} onChange={(e) => setTitle(e.target.value)} className="field py-1.5 text-sm" maxLength={150} />
          </div>
          <div>
            <label htmlFor={`cd-${item.id}`} className="label">More detail (the client sees this)</label>
            <textarea id={`cd-${item.id}`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="field py-1.5 text-sm" maxLength={1000} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!title.trim()}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={clsx('flex items-start gap-3 rounded-xl border-[1.5px] p-3', ticked ? 'border-line bg-paper' : 'border-ink bg-white')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={ticked}
        aria-label={ticked ? `Mark “${item.title}” as not in` : `Mark “${item.title}” as in`}
        title={ticked ? 'Untick' : 'Tick for the client (e.g. it came by email)'}
        onClick={() => save(() => apiService.tickChecklist(project.id, item.id, !ticked, ticked ? null : item.note))}
        className={clsx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-[1.5px] border-ink', ticked ? 'bg-mint' : 'bg-white hover:bg-sun-soft')}
      >
        {ticked && <CheckIcon className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={clsx('text-sm font-semibold', ticked && 'text-muted line-through decoration-1')}>{item.title}</p>
        {item.description && <p className="mt-0.5 text-xs leading-5 text-muted">{item.description}</p>}
        {ticked && (
          <p className="text-xs text-muted">
            In {timeAgo(item.done_at)}
            {item.done_by_name ? ` · ticked by ${item.done_by_name}` : ''}
          </p>
        )}
        {item.note && <p className="mt-1 rounded-lg bg-sun-soft px-2.5 py-1.5 text-xs">{item.note}</p>}
      </div>
      <span className="flex shrink-0 gap-1">
        <button type="button" className={icon} aria-label={`Edit ${item.title}`} title="Edit" onClick={() => setEditing(true)}>
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={`${icon} hover:border-danger hover:text-danger`}
          aria-label={`Remove ${item.title}`}
          title="Remove"
          onClick={() => {
            if (window.confirm(`Take "${item.title}" off the list?`)) save(() => apiService.adminDeleteChecklistItem(project.id, item.id));
          }}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </span>
    </li>
  );
}

function AddItem({ project, save }: { project: ProjectDetail; save: Save }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await save(() => apiService.adminAddChecklistItem(project.id, title.trim(), description.trim() || null));
      setTitle('');
      setDescription('');
      setOpen(false);
    } catch {
      // Shown by `save`.
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={project.checklist.length >= 30}>
          Ask for something
        </Button>
        <button
          type="button"
          onClick={() => save(() => apiService.adminAddStandardChecklist(project.id)).catch(() => undefined)}
          className="text-xs font-semibold text-cobalt underline-offset-4 hover:underline"
          title="Adds any of the usual items (logo, words, photos, web address, sign-off) the list is missing"
        >
          Add the usual items
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 grid gap-2 border-t border-line pt-4">
      <div>
        <label htmlFor="new-check" className="label">What you need from the client</label>
        <input id="new-check" value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="Your opening hours" maxLength={150} />
      </div>
      <div>
        <label htmlFor="new-check-desc" className="label">More detail (optional)</label>
        <textarea id="new-check-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="field" maxLength={1000} placeholder="For the contact page, including public holidays." />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !title.trim()}>{busy ? 'Adding…' : 'Add to the list'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
