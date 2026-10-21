'use client';

import { useEffect, useRef, useState } from 'react';
import { DocumentIcon, PaperClipIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { apiService } from '@/services/api';
import type { ProjectFile } from '@/types/api';
import { errorText, formatSize } from './format';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 6;

type Pending = {
  key: string;
  name: string;
  size: number;
  // A local preview for pictures, made from the file before it uploads.
  preview: string | null;
  file: ProjectFile | null;
  failed: string | null;
};

/**
 * A message box that can carry files and pictures. Each file uploads as soon as
 * it is picked, so sending is quick; it only becomes visible to anyone else once
 * the message is sent. Clears itself once the message is saved.
 */
export function MessageComposer({
  projectId,
  onSend,
  placeholder,
}: {
  projectId: string;
  onSend: (body: string, attachmentIds: string[]) => Promise<void>;
  placeholder?: string;
}) {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);

  // Free the local previews when the box goes away.
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const uploading = pending.some((p) => !p.file && !p.failed);
  const ready = pending.filter((p) => p.file);
  const canSend = !busy && !uploading && (body.trim().length > 0 || ready.length > 0);

  function update(key: string, change: Partial<Pending>) {
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)));
  }

  function pick(list: FileList | null) {
    if (input.current) input.current.value = '';
    if (!list?.length) return;
    setError(null);
    const room = MAX_FILES - pending.length;
    const chosen = Array.from(list);
    if (chosen.length > room) setError(`You can attach up to ${MAX_FILES} files to one message.`);
    for (const file of chosen.slice(0, Math.max(room, 0))) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const preview = file.type.startsWith('image/') && file.type !== 'image/svg+xml' ? URL.createObjectURL(file) : null;
      if (preview) previews.current.push(preview);
      const item: Pending = { key, name: file.name, size: file.size, preview, file: null, failed: null };
      if (file.size > MAX_BYTES) {
        item.failed = 'Bigger than 10 MB';
        setPending((all) => [...all, item]);
        continue;
      }
      setPending((all) => [...all, item]);
      apiService
        .uploadAttachment(projectId, file)
        .then((saved) => update(key, { file: saved }))
        .catch((reason) => update(key, { failed: errorText(reason, 'Did not upload') }));
    }
  }

  function remove(item: Pending) {
    setPending((list) => list.filter((p) => p.key !== item.key));
    if (item.preview) URL.revokeObjectURL(item.preview);
    // Tidy it away on the server too; if this fails it is cleared within a day anyway.
    if (item.file) apiService.deleteFile(projectId, item.file.id).catch(() => undefined);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body.trim(), ready.map((p) => p.file!.id));
      setBody('');
      pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      setPending([]);
    } catch (reason) {
      setError(errorText(reason, 'That did not send. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        pick(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        // Pasting a screenshot attaches it.
        if (e.clipboardData.files.length) {
          e.preventDefault();
          pick(e.clipboardData.files);
        }
      }}
    >
      <label htmlFor={`message-${projectId}`} className="sr-only">Message</label>
      <textarea
        id={`message-${projectId}`}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder ?? 'Ask us anything or share an update…'}
        className="field"
        maxLength={4000}
      />

      {pending.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Attached files">
          {pending.map((item) => (
            <li
              key={item.key}
              className={`relative overflow-hidden rounded-lg border-[1.5px] bg-white ${item.failed ? 'border-danger' : 'border-line'}`}
            >
              {item.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked file
                <img src={item.preview} alt="" className={`aspect-[4/3] w-full object-cover ${item.file ? '' : 'opacity-60'}`} />
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-paper">
                  <DocumentIcon className="h-7 w-7 text-muted" aria-hidden />
                </div>
              )}
              <div className="border-t-[1.5px] border-line px-2 py-1.5">
                <p className="truncate text-xs font-semibold" title={item.name}>{item.name}</p>
                <p className={`truncate text-[11px] ${item.failed ? 'text-danger' : 'text-muted'}`}>
                  {item.failed ?? (item.file ? formatSize(item.size) : 'Uploading…')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(item)}
                className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full border-[1.5px] border-ink bg-white hover:bg-ink hover:text-paper"
                aria-label={`Remove ${item.name}`}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          id={`attach-${projectId}`}
          onChange={(e) => pick(e.target.files)}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy || pending.length >= MAX_FILES}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-soft hover:bg-ink/5 disabled:opacity-50 sm:min-h-9"
        >
          <PaperClipIcon className="h-5 w-5" aria-hidden />
          Attach files or pictures
        </button>
        <Button type="submit" size="sm" className="min-h-11 sm:min-h-0" disabled={!canSend}>
          {busy ? 'Sending…' : uploading ? 'Uploading…' : 'Send message'}
        </Button>
      </div>
      <p className="text-xs text-muted">Up to {MAX_FILES} files, 10 MB each. You can also drag them in or paste a screenshot.</p>
    </form>
  );
}
