'use client';

import { useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { apiService } from '@/services/api';
import type { HandoverItem, ProjectDetail } from '@/types/api';
import { Pill } from './Pill';
import { formatDateTime } from './format';

type Save = (work: () => Promise<ProjectDetail>) => Promise<void>;
type Row = { label: string; value: string; url: string };

// A start for a new pack: the usual things a client needs to look after a site.
const STARTER: Row[] = [
  { label: 'Live site', value: '', url: '' },
  { label: 'Where it is hosted', value: '', url: '' },
  { label: 'Domain name', value: '', url: '' },
  { label: 'How to update it', value: '', url: '' },
  { label: 'Who to call', value: '', url: '' },
];

const MAX_ITEMS = 40;

function toRows(items: HandoverItem[]): Row[] {
  return items.map((i) => ({ label: i.label, value: i.value ?? '', url: i.url ?? '' }));
}

/**
 * The hand-over pack: everything the client needs once the work is done. A
 * draft until published; publishing posts it on the client's timeline and emails them.
 */
export function HandoverEditor({ project, save }: { project: ProjectDetail; save: Save }) {
  const pack = project.handover;
  const [notes, setNotes] = useState(pack?.notes ?? '');
  const [rows, setRows] = useState<Row[]>(pack ? toRows(pack.items) : STARTER);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const published = Boolean(pack?.published_at);

  const filled = rows.filter((r) => r.label.trim() && (r.value.trim() || r.url.trim()));
  const payload = {
    notes: notes.trim() || null,
    items: filled.map((r) => ({ label: r.label.trim(), value: r.value.trim() || null, url: r.url.trim() || null })),
  };
  const dirty =
    !pack ||
    (pack.notes ?? '') !== (payload.notes ?? '') ||
    JSON.stringify(pack.items.map((i) => ({ label: i.label, value: i.value, url: i.url }))) !== JSON.stringify(payload.items);
  const empty = !payload.notes && payload.items.length === 0;

  function change(index: number, field: keyof Row, value: string) {
    setSaved(false);
    setRows((list) => list.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  async function run(work: () => Promise<ProjectDetail>) {
    setBusy(true);
    setSaved(false);
    try {
      await save(work);
      return true;
    } catch {
      // Shown by `save`.
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (await run(() => apiService.adminSaveHandover(project.id, payload))) setSaved(true);
  }

  async function publish() {
    const what = project.client_name || project.client_email || 'the client';
    if (!window.confirm(`Publish the hand-over pack? ${what} gets an email and sees it on their project page.`)) return;
    await run(async () => {
      if (dirty) await apiService.adminSaveHandover(project.id, payload);
      return apiService.adminPublishHandover(project.id);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {published ? (
          <Pill tone="bg-mint text-ink">Published</Pill>
        ) : (
          <Pill tone="bg-line text-ink">{pack ? 'Draft' : 'Not started'}</Pill>
        )}
        <span className="text-xs text-muted">
          {published && pack?.published_at
            ? `The client can see it · since ${formatDateTime(pack.published_at)}`
            : 'Only the team can see it until you publish it.'}
        </span>
      </div>

      <div>
        <label htmlFor="handover-notes" className="label">A note to the client</label>
        <textarea
          id="handover-notes"
          rows={4}
          maxLength={10000}
          value={notes}
          onChange={(e) => {
            setSaved(false);
            setNotes(e.target.value);
          }}
          className="field text-sm"
          placeholder="How to look after the site day to day, what we set up, and what to do if something breaks."
        />
      </div>

      <fieldset className="grid gap-3">
        <legend className="label">Details and links</legend>
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 rounded-xl border-[1.5px] border-line bg-paper p-3">
            <div className="flex items-center gap-2">
              <label htmlFor={`ho-label-${index}`} className="sr-only">Label</label>
              <input
                id={`ho-label-${index}`}
                value={row.label}
                onChange={(e) => change(index, 'label', e.target.value)}
                className="field py-1.5 text-sm font-semibold"
                maxLength={100}
                placeholder="Label, e.g. Admin login"
              />
              <button
                type="button"
                aria-label={`Remove ${row.label || 'this line'}`}
                title="Remove"
                onClick={() => {
                  setSaved(false);
                  setRows((list) => list.filter((_, i) => i !== index));
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-line bg-white hover:border-danger hover:text-danger"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <label htmlFor={`ho-value-${index}`} className="sr-only">Details</label>
            <textarea
              id={`ho-value-${index}`}
              rows={1}
              value={row.value}
              onChange={(e) => change(index, 'value', e.target.value)}
              className="field py-1.5 text-sm"
              maxLength={500}
              placeholder="Details, e.g. renews every March, account in your name"
            />
            <label htmlFor={`ho-url-${index}`} className="sr-only">Link</label>
            <input
              id={`ho-url-${index}`}
              type="url"
              value={row.url}
              onChange={(e) => change(index, 'url', e.target.value)}
              className="field py-1.5 text-sm"
              placeholder="https:// (optional)"
            />
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          disabled={rows.length >= MAX_ITEMS}
          onClick={() => setRows((list) => [...list, { label: '', value: '', url: '' }])}
        >
          <PlusIcon className="h-4 w-4" /> Add a line
        </Button>
        <p className="text-xs text-muted">Lines with only a label are left out. Never put passwords here: send those another way.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button type="button" variant="secondary" size="sm" onClick={saveDraft} disabled={busy || !dirty || (empty && !pack)}>
          {busy ? 'Saving…' : published ? 'Save changes' : 'Save draft'}
        </Button>
        {published ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Hide the hand-over pack from the client while you fix it?')) {
                run(() => apiService.adminUnpublishHandover(project.id));
              }
            }}
          >
            Hide from the client
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={publish} disabled={busy || empty}>
            Publish to the client
          </Button>
        )}
        {saved && !dirty && <span className="text-xs text-muted">Saved{published ? '. The client sees the change now.' : '.'}</span>}
      </div>
    </div>
  );
}
