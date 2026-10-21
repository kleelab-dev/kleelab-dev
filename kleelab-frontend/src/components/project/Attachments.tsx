'use client';

import { useEffect, useState } from 'react';
import { DocumentIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import type { ProjectFile } from '@/types/api';
import { errorText, formatSize } from './format';

// Pictures we show in the page. SVG is left out on purpose: it can carry script.
const PICTURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);

export function isPicture(file: Pick<ProjectFile, 'content_type'>): boolean {
  return PICTURE_TYPES.has(file.content_type);
}

/** A signed-in picture, fetched with the session and shown from a local URL. */
function Thumbnail({ projectId, file }: { projectId: string; file: ProjectFile }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let live = true;
    apiService
      .fileObjectUrl(projectId, file.id)
      .then((made) => {
        url = made;
        if (live) setSrc(made);
        else URL.revokeObjectURL(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projectId, file.id]);

  return (
    <a
      href={src ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block aspect-[4/3] overflow-hidden rounded-lg border-[1.5px] border-line bg-paper"
      title={`Open ${file.filename}`}
      aria-label={`Open ${file.filename}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not something next/image can optimise
        <img src={src} alt={file.filename} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
      ) : (
        <span className="grid h-full w-full place-items-center text-muted">
          <PhotoIcon className={failed ? 'h-6 w-6' : 'kl-dot h-6 w-6'} aria-hidden />
        </span>
      )}
    </a>
  );
}

/** Files sent with a message: pictures as thumbnails, everything else as a download. */
export function Attachments({ projectId, files }: { projectId: string; files: ProjectFile[] }) {
  const [error, setError] = useState<string | null>(null);
  if (!files.length) return null;
  const pictures = files.filter(isPicture);
  const others = files.filter((f) => !isPicture(f));

  async function download(file: ProjectFile) {
    setError(null);
    try {
      await apiService.downloadFile(projectId, file.id, file.filename);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return (
    <div className="mt-3 grid gap-2">
      {pictures.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {pictures.map((file) => (
            <Thumbnail key={file.id} projectId={projectId} file={file} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {others.map((file) => (
            <li key={file.id} className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => download(file)}
                className="flex min-h-10 max-w-full items-center gap-2 rounded-lg border-[1.5px] border-line bg-white px-3 py-1.5 text-left text-sm hover:border-ink"
                title={`Download ${file.filename}`}
              >
                <DocumentIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <span className="truncate font-semibold text-cobalt">{file.filename}</span>
                <span className="shrink-0 text-xs text-muted">{formatSize(file.size)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
