'use client';

import { PlusIcon } from '@heroicons/react/24/outline';
import type { Page } from '@/types/api';

type Props = {
  pages: Page[];
  currentPageId: string | null;
  busy: boolean;
  onSelect: (page: Page) => void;
  onCreate: () => void;
};

export function PagesBar({ pages, currentPageId, busy, onSelect, onCreate }: Props) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-paper px-3">
      <span className="mr-2 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
        Pages
      </span>
      {pages.map((page) => (
        <button
          key={page.id}
          type="button"
          onClick={() => onSelect(page)}
          aria-pressed={page.id === currentPageId}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${
            page.id === currentPageId ? 'bg-mint text-ink' : 'text-muted hover:bg-canvas hover:text-ink'
          }`}
        >
          {page.title}
        </button>
      ))}
      <button
        type="button"
        onClick={onCreate}
        disabled={busy}
        title="Add a page"
        className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1 text-xs font-bold text-muted transition hover:border-accent hover:text-accent disabled:opacity-40"
      >
        <PlusIcon className="h-3.5 w-3.5" /> Add page
      </button>
    </div>
  );
}
