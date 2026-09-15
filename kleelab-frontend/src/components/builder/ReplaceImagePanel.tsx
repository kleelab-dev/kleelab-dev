'use client';

import { useState } from 'react';
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useBuilderStore } from '@/lib/editor/store';
import { findNode } from '@/lib/editor/tree';

/**
 * Putting your own picture in.
 *
 * The assistant chooses photographs from a placeholder service, which is the best
 * it can do — it does not have the business's photographs, and a site illustrated
 * with someone else's stock images is not the site the owner wanted. So this is
 * the one change that is made by hand, and it is not a return to the old editor:
 * one field, one picture, and it goes through exactly the same validated and
 * undoable path the assistant's changes take.
 */
export function ReplaceImagePanel({
  nodeId,
  onCancel,
  onApply,
}: {
  nodeId: string;
  onCancel: () => void;
  onApply: (nodeId: string, url: string, alt: string) => void;
}) {
  const node = useBuilderStore((state) => findNode(state.document.root, nodeId));
  const [url, setUrl] = useState(
    typeof node?.props?.src === 'string' ? node.props.src : '',
  );
  const [alt, setAlt] = useState(
    typeof node?.props?.alt === 'string'
      ? node.props.alt
      : typeof node?.props?.intent === 'string'
        ? node.props.intent
        : '',
  );

  const usable = /^(https?:\/\/|data:image\/|\/)/i.test(url.trim());

  /** A different placeholder, for when the current one is the wrong subject. */
  const shuffle = () => {
    const seed = Math.random().toString(36).slice(2, 10);
    setUrl(`https://picsum.photos/seed/${seed}/1600/1000`);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-line-strong bg-paper p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
            Use your own picture
          </span>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-muted hover:text-ink">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-2 block text-[11px] font-bold text-muted" htmlFor="kl-image-url">
          Picture address
        </label>
        <input
          id="kl-image-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
          className="mb-3 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <label className="mb-2 block text-[11px] font-bold text-muted" htmlFor="kl-image-alt">
          What the picture shows
        </label>
        <input
          id="kl-image-alt"
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          placeholder="A loaf cooling on a wire rack"
          className="mb-1 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <p className="mb-4 text-[11px] text-muted">
          Describing it helps search engines and screen readers, and tells the assistant what the
          picture is.
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={shuffle}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-bold transition hover:border-ink"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" /> Different photo
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto rounded-lg border border-line px-3 py-2 text-xs font-bold transition hover:border-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(nodeId, url.trim(), alt.trim())}
            disabled={!usable}
            className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-paper transition hover:bg-accent disabled:opacity-40"
          >
            Use this picture
          </button>
        </div>
      </div>
    </div>
  );
}
