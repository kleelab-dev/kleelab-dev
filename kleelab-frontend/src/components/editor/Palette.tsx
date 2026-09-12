'use client';

import { useDraggable } from '@dnd-kit/core';
import { PlusIcon } from '@heroicons/react/24/outline';
import type { NodeType } from '@/lib/document';
import { PALETTE, nodeFromPalette, type PaletteEntry } from '@/lib/editor/palette';
import { useEditorStore } from '@/lib/editor/store';
import { canHaveChildren, findNode, findParent } from '@/lib/editor/tree';

function PaletteItem({ entry }: { entry: PaletteEntry }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${entry.type}`,
    data: { source: 'palette', type: entry.type satisfies NodeType },
  });

  const document = useEditorStore((state) => state.document);
  const selectedId = useEditorStore((state) => state.selectedId);
  const appendNode = useEditorStore((state) => state.appendNode);

  /** Click = add to the current selection's container (or the page root). */
  const addToSelection = () => {
    let parentId = document.root.id;
    if (selectedId) {
      const selected = findNode(document.root, selectedId);
      if (selected) {
        parentId = canHaveChildren(selected.type)
          ? selected.id
          : (findParent(document.root, selectedId)?.id ?? document.root.id);
      }
    }
    appendNode(parentId, nodeFromPalette(entry.type));
  };

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={addToSelection}
      title={`${entry.hint} — drag onto the page, or click to add`}
      className={`flex w-full cursor-grab items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-left text-xs font-bold text-ink transition hover:border-accent hover:bg-mint/40 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <PlusIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
      {entry.label}
    </button>
  );
}

export function Palette() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-line bg-paper p-3 lg:flex">
      <p className="px-1 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
        Blocks
      </p>
      <div className="grid gap-1.5">
        {PALETTE.map((entry) => (
          <PaletteItem key={entry.type} entry={entry} />
        ))}
      </div>
      <p className="mt-4 px-1 text-[10px] leading-4 text-muted">
        Drag a block onto the canvas to place it exactly where you want.
      </p>
    </aside>
  );
}
