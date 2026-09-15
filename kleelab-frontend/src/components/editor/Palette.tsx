'use client';

import { useDraggable } from '@dnd-kit/core';
import { PlusIcon, SquaresPlusIcon } from '@heroicons/react/24/outline';
import type { NodeType } from '@/lib/document';
import { PALETTE, nodeFromPalette, type PaletteEntry } from '@/lib/editor/palette';
import { buildSection, recipesByCategory } from '@/lib/sections/kit';
import { useEditorStore } from '@/lib/editor/store';
import { canHaveChildren, findNode, findParent } from '@/lib/editor/tree';
import { ThemePanel } from '@/components/editor/ThemePanel';

/**
 * Where a clicked block should land: inside the current selection when that can
 * hold children, otherwise beside it, otherwise at the end of the page.
 *
 * Shared by blocks and sections so the two cannot behave differently.
 */
function useInsertTarget() {
  const document = useEditorStore((state) => state.document);
  const selectedId = useEditorStore((state) => state.selectedId);
  return () => {
    if (!selectedId) return document.root.id;
    const selected = findNode(document.root, selectedId);
    if (!selected) return document.root.id;
    return canHaveChildren(selected.type)
      ? selected.id
      : (findParent(document.root, selectedId)?.id ?? document.root.id);
  };
}

function PaletteItem({ entry, onPick }: { entry: PaletteEntry; onPick?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${entry.type}`,
    data: { source: 'palette', type: entry.type satisfies NodeType },
  });

  const appendNode = useEditorStore((state) => state.appendNode);
  const resolveTarget = useInsertTarget();

  /** Click = add to the current selection's container (or the page root). */
  const addToSelection = () => {
    appendNode(resolveTarget(), nodeFromPalette(entry.type));
    onPick?.();
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

/**
 * A designed section, ready to drop in.
 *
 * These are the same recipes the AI builder composes from, which is deliberate:
 * a customer who does not like what the model chose can add exactly the section
 * they wanted, and any mistake in a recipe is visible to us the moment we drag it
 * rather than only when a model happens to pick it.
 */
function SectionItem({ id, name, description, onPick }: {
  id: string;
  name: string;
  description: string;
  onPick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `section:${id}`,
    data: { source: 'section', sectionId: id },
  });

  const appendNode = useEditorStore((state) => state.appendNode);
  const resolveTarget = useInsertTarget();

  const addToSelection = () => {
    const node = buildSection(id);
    if (!node) return;
    appendNode(resolveTarget(), node);
    onPick?.();
  };

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={addToSelection}
      title={`${description} — drag onto the page, or click to add`}
      className={`flex w-full cursor-grab items-start gap-2 rounded-lg border border-line bg-white px-3 py-2 text-left transition hover:border-accent hover:bg-mint/40 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <SquaresPlusIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block text-xs font-bold text-ink">{name}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-muted">{description}</span>
      </span>
    </button>
  );
}

export function Palette({ className = '', onPick }: { className?: string; onPick?: () => void }) {
  const groups = recipesByCategory();

  return (
    <aside className={`flex w-56 shrink-0 flex-col overflow-y-auto border-r border-line bg-paper p-3 ${className}`}>
      <ThemePanel />
      <p className="px-1 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
        Sections
      </p>
      <div className="grid gap-1.5">
        {groups.map((group) => (
          <div key={group.category}>
            <p className="px-1 pb-1 pt-2 font-mono text-[9px] uppercase tracking-label text-muted">
              {group.label}
            </p>
            <div className="grid gap-1.5">
              {group.recipes.map((recipe) => (
                <SectionItem
                  key={recipe.id}
                  id={recipe.id}
                  name={recipe.name}
                  description={recipe.description}
                  onPick={onPick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="px-1 pb-3 pt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
        Blocks
      </p>
      <div className="grid gap-1.5">
        {PALETTE.map((entry) => (
          <PaletteItem key={entry.type} entry={entry} onPick={onPick} />
        ))}
      </div>
      <p className="mt-4 px-1 text-[10px] leading-4 text-muted">
        Drag a section or a block onto the canvas to place it exactly where you want.
      </p>
    </aside>
  );
}
