'use client';

import { CSS } from '@dnd-kit/utilities';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Bars3Icon, DocumentDuplicateIcon, TrashIcon } from '@heroicons/react/24/outline';
import { NODE_REGISTRY } from '@/components/render/registry';
import { themeVariables, type Node } from '@/lib/document';
import { canHaveChildren, findNode } from '@/lib/editor/tree';
import { nodeLabel } from '@/lib/editor/palette';
import { useEditorStore, type Device } from '@/lib/editor/store';

/** Drop target that lets a user append into a container (including empty ones). */
function DropZone({ containerId }: { containerId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${containerId}`, data: { containerId } });
  return (
    <div
      ref={setNodeRef}
      className={`h-2 rounded transition ${isOver ? 'h-10 bg-accent/20 outline outline-dashed outline-accent' : ''}`}
    />
  );
}

function CanvasNode({ node, isRoot = false }: { node: Node; isRoot?: boolean }) {
  const selectedId = useEditorStore((state) => state.selectedId);
  const select = useEditorStore((state) => state.select);
  const removeNode = useEditorStore((state) => state.removeNode);
  const duplicateNode = useEditorStore((state) => state.duplicateNode);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    data: { source: 'canvas', nodeId: node.id },
    disabled: isRoot,
  });

  const Component = NODE_REGISTRY[node.type];
  const selected = selectedId === node.id;
  const container = canHaveChildren(node.type);
  const childIds = (node.children ?? []).map((child) => child.id);

  const chrome = (
    <div className="pointer-events-none absolute -top-3 left-1 z-20 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 data-[selected=true]:opacity-100" data-selected={selected}>
      <span
        {...attributes}
        {...listeners}
        className={`pointer-events-auto flex cursor-grab items-center gap-1 rounded-full bg-ink px-2 py-1 text-[10px] font-bold text-paper ${isRoot ? 'hidden' : ''}`}
        title={isRoot ? undefined : 'Drag to move'}
      >
        <Bars3Icon className="h-3 w-3" />
        {nodeLabel(node)}
      </span>
      {!isRoot && (
        <>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); duplicateNode(node.id); }}
            className="pointer-events-auto rounded-full bg-white p-1 text-ink shadow ring-1 ring-line hover:bg-mint"
            title="Duplicate"
          >
            <DocumentDuplicateIcon className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); removeNode(node.id); }}
            className="pointer-events-auto rounded-full bg-white p-1 text-accent shadow ring-1 ring-line hover:bg-danger-surface"
            title="Delete"
          >
            <TrashIcon className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );

  const body = (
    <Component node={node}>
      {container ? (
        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
          {(node.children ?? []).map((child) => (
            <CanvasNode key={child.id} node={child} />
          ))}
          <DropZone containerId={node.id} />
        </SortableContext>
      ) : undefined}
    </Component>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(event) => { event.stopPropagation(); if (!isRoot) select(node.id); }}
      className={`group relative outline-offset-2 ${
        selected ? 'outline outline-2 outline-accent' : 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-line-strong'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {!isRoot && chrome}
      {body}
    </div>
  );
}

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: 'max-w-[900px]',
  tablet: 'max-w-[560px]',
  mobile: 'max-w-[380px]',
};

export function Canvas() {
  const document = useEditorStore((state) => state.document);
  const select = useEditorStore((state) => state.select);
  const device = useEditorStore((state) => state.device);

  const empty = (document.root.children ?? []).length === 0;

  return (
    <div className="flex-1 overflow-auto bg-canvas p-6" onClick={() => select(null)}>
      {/*
        The theme variables belong here as well as on the published page. The
        canvas renders nodes directly rather than through DocumentRenderer, so
        without this every var(--kl-*) resolved to nothing and the canvas drew
        an unstyled, colourless page - while the published site looked correct.
      */}
      <div
        className={`mx-auto min-h-[520px] overflow-hidden rounded-xl bg-white shadow-[0_12px_35px_rgba(23,35,28,.09)] transition-all ${DEVICE_WIDTH[device]}`}
        style={themeVariables(document.tokens) as React.CSSProperties}
      >
        {empty ? (
          <div className="grid h-[520px] place-items-center p-8 text-center">
            <div>
              <p className="font-serif text-2xl">This page is empty</p>
              <p className="mt-2 text-sm text-muted">
                Drag a block from the left panel, or click one to add it.
              </p>
            </div>
          </div>
        ) : (
          <CanvasNode node={document.root} isRoot />
        )}
      </div>
    </div>
  );
}

/** Exposed for the inspector so it can read the current selection. */
export function useSelectedNode(): Node | null {
  const document = useEditorStore((state) => state.document);
  const selectedId = useEditorStore((state) => state.selectedId);
  if (!selectedId) return null;
  return findNode(document.root, selectedId);
}
