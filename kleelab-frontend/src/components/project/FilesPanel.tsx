'use client';

import { useRef, useState } from 'react';
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon, LinkIcon, PaperClipIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { apiService } from '@/services/api';
import type { ProjectDetail, ProjectFile, ProjectUpdate } from '@/types/api';
import { errorText, formatDate, formatSize } from './format';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Files shared on a project, both ways. The team can remove any file; a client
 * can remove only the ones they shared.
 *
 * `links` (previews and other links posted in updates) are listed first, in the
 * same list, so there is one place to find everything shared. `empty` replaces
 * the text shown when there is nothing at all.
 */
export function FilesPanel({
  project,
  team = false,
  links = [],
  empty,
  onChange,
}: {
  project: ProjectDetail;
  team?: boolean;
  links?: ProjectUpdate[];
  empty?: string;
  onChange: (project: ProjectDetail) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = [...project.files].sort((a, b) => b.created_at.localeCompare(a.created_at));

  async function upload(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('That file is bigger than 10 MB. Please share a link to it instead.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await apiService.uploadFile(project.id, file));
    } catch (reason) {
      setError(errorText(reason, 'That file did not upload. Please try again.'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(file: ProjectFile) {
    if (!window.confirm(`Remove ${file.filename}? This cannot be undone.`)) return;
    setError(null);
    try {
      onChange(await apiService.deleteFile(project.id, file.id));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function download(file: ProjectFile) {
    setError(null);
    try {
      await apiService.downloadFile(project.id, file.id, file.filename);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return (
    <div>
      {files.length || links.length ? (
        <ul className="grid gap-2">
          {links.map((update) =>
            update.link_url ? (
              <li key={`link-${update.id}`} className="flex items-center gap-2 rounded-xl border-[1.5px] border-line bg-white p-2.5 sm:gap-3 sm:p-3">
                <LinkIcon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <a
                    href={update.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block min-h-6 max-w-full truncate text-sm font-semibold text-cobalt hover:underline"
                    title={update.title || update.link_label || update.link_url}
                  >
                    {update.title || update.link_label || 'Link'}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <p className="truncate text-xs text-muted">
                    {update.title && update.link_label ? `${update.link_label} · ` : ''}
                    {update.from_team ? (team ? update.author_name || 'The team' : 'From KleeLab') : team ? `From ${update.author_name || 'the client'}` : 'From you'} · {formatDate(update.created_at)}
                  </p>
                </div>
                <a
                  href={update.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-ink/5"
                  aria-label={`Open ${update.title || update.link_label || 'link'} in a new tab`}
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </a>
              </li>
            ) : null,
          )}
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 rounded-xl border-[1.5px] border-line bg-white p-2.5 sm:gap-3 sm:p-3">
              <PaperClipIcon className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => download(file)}
                  className="block min-h-6 max-w-full truncate text-left text-sm font-semibold text-cobalt hover:underline"
                  title={file.filename}
                >
                  {file.filename}
                </button>
                <p className="text-xs text-muted">
                  {formatSize(file.size)} · {file.from_team ? (team ? file.uploaded_by_name || 'The team' : 'From KleeLab') : team ? `From ${file.uploaded_by_name || 'the client'}` : 'From you'} · {formatDate(file.created_at)}
                </p>
              </div>
              <button type="button" onClick={() => download(file)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-ink/5" aria-label={`Download ${file.filename}`}>
                <ArrowDownTrayIcon className="h-4 w-4" />
              </button>
              {(team || !file.from_team) && (
                <button type="button" onClick={() => remove(file)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Remove ${file.filename}`}>
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          {empty ?? (team ? 'No files yet. Share designs, documents or logins here.' : 'No files yet. Send us your logo, photos, text or anything else we need.')}
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input ref={input} type="file" className="sr-only" id={`file-${project.id}`} onChange={(e) => upload(e.target.files)} />
        <Button type="button" variant="secondary" size="sm" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Uploading…' : 'Add a file'}
        </Button>
        <span className="text-xs text-muted">Up to 10 MB each.{team ? ' The client gets an email.' : ' We get an email.'}</span>
      </div>
    </div>
  );
}
