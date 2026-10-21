'use client';

import { useEffect, useRef, useState } from 'react';
import { DocumentIcon, PaperClipIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import type { ProjectFile } from '@/types/api';
import { errorText, formatSize } from './format';

const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 6;

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
 * Files picked for an update that has not been posted yet. Each one uploads as
 * soon as it is picked and stays hidden from the client until the update goes.
 */
export function useAttachments(projectId: string) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const previews = useRef<string[]>([]);

  // Free the local previews when the form goes away.
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function update(key: string, change: Partial<Pending>) {
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)));
  }

  function pick(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const room = MAX_FILES - pending.length;
    const chosen = Array.from(list);
    if (chosen.length > room) setError(`You can attach up to ${MAX_FILES} files to one update.`);
    for (const file of chosen.slice(0, Math.max(room, 0))) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const preview = file.type.startsWith('image/') && file.type !== 'image/svg+xml' ? URL.createObjectURL(file) : null;
      if (preview) previews.current.push(preview);
      const item: Pending = { key, name: file.name, size: file.size, preview, file: null, failed: null };
      if (file.size > MAX_BYTES) {
        setPending((all) => [...all, { ...item, failed: 'Bigger than 10 MB' }]);
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

  /** After posting: the files now belong to the update, so only drop the local list. */
  function clear() {
    pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    setPending([]);
    setError(null);
  }

  /** Before switching to a team note, which cannot carry files. */
  function discard() {
    pending.forEach(remove);
    setError(null);
  }

  return {
    pending,
    error,
    pick,
    remove,
    clear,
    discard,
    uploading: pending.some((p) => !p.file && !p.failed),
    ids: pending.filter((p) => p.file).map((p) => p.file!.id),
  };
}

export function AttachmentPicker({ id, files, disabled }: { id: string; files: ReturnType<typeof useAttachments>; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className="grid gap-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        files.pick(e.dataTransfer.files);
      }}
    >
      {files.pending.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Attached files">
          {files.pending.map((item) => (
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
                onClick={() => files.remove(item)}
                className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full border-[1.5px] border-ink bg-white hover:bg-ink hover:text-paper"
                aria-label={`Remove ${item.name}`}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.error && <p role="alert" className="text-sm text-danger">{files.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          id={id}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            files.pick(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled || files.pending.length >= MAX_FILES}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-soft hover:bg-ink/5 disabled:opacity-50"
        >
          <PaperClipIcon className="h-5 w-5" aria-hidden />
          Attach files or pictures
        </button>
        <span className="text-xs text-muted">Up to {MAX_FILES} files, 10 MB each. Designs and screenshots show as pictures.</span>
      </div>
    </div>
  );
}
