'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { AdjustmentsHorizontalIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import { createDocument, parseDocument, type KleeLabDocument, type NodeType } from '@/lib/document';
import { useEditorStore } from '@/lib/editor/store';
import { canHaveChildren, findNode, findParent } from '@/lib/editor/tree';
import { nodeFromPalette, nodeLabel, PALETTE_BY_TYPE } from '@/lib/editor/palette';
import type { Page, Site } from '@/types/api';
import { Canvas } from './Canvas';
import { PagesBar } from './PagesBar';
import { Palette } from './Palette';
import { Inspector } from './Inspector';
import { EditorBanner, Toolbar } from './Toolbar';

type DragData = { source?: 'palette' | 'canvas'; type?: NodeType; nodeId?: string };

/**
 * Prefer the droppable under the pointer, and among those the smallest (i.e.
 * deepest) one. Plain `closestCenter` compares element centres, which resolved
 * drops onto the page root whenever a node was dragged by its own handle.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length > 0) {
    return [...within].sort((a, b) => {
      const rectA = args.droppableRects.get(a.id);
      const rectB = args.droppableRects.get(b.id);
      const areaA = rectA ? rectA.width * rectA.height : Number.POSITIVE_INFINITY;
      const areaB = rectB ? rectB.width * rectB.height : Number.POSITIVE_INFINITY;
      return areaA - areaB;
    });
  }
  return closestCenter(args);
};

export function EditorShell({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'blocks' | 'inspector'>('none');

  const document = useEditorStore((state) => state.document);
  const loaded = useEditorStore((state) => state.loaded);
  const saveState = useEditorStore((state) => state.saveState);
  const lastSaved = useRef('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load the site and its pages, then the document for the first page.
  useEffect(() => {
    let active = true;
    Promise.all([apiService.getSite(siteId), apiService.getPages(siteId)])
      .then(([loadedSite, loadedPages]) => {
        if (!active) return;
        setSite(loadedSite);
        setPages(loadedPages);
        setPublicUrl(loadedSite.subdomain ? `/s/${loadedSite.subdomain}` : null);

        const page =
          loadedPages.find((item) => item.slug === '/' || item.slug === 'home') ?? loadedPages[0];
        if (!page) {
          setError('This site has no pages yet. Create one from the dashboard.');
          return;
        }

        const doc = parseDocument(page.content_json, page.title);
        lastSaved.current = JSON.stringify(doc);
        useEditorStore.getState().load(doc);
        setPageId(page.id);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  const pending = useRef<{ signature: string; pageId: string; document: KleeLabDocument } | null>(null);

  /** Write any queued change immediately. Used before switching pages. */
  const saveNow = useCallback(async () => {
    const queued = pending.current;
    if (!queued) return;
    pending.current = null;
    const store = useEditorStore.getState();
    store.setSaveState('saving');
    try {
      await apiService.saveDocument(siteId, queued.pageId, queued.document);
      lastSaved.current = queued.signature;
      store.setSaveState('saved');
    } catch (reason) {
      store.setError(reason instanceof Error ? reason.message : 'Unable to save changes');
      store.setSaveState('error');
    }
  }, [siteId]);

  // Autosave. State is only touched from the debounce callback, never
  // synchronously in the effect body.
  useEffect(() => {
    if (!loaded || !pageId) return;
    const signature = JSON.stringify(document);
    if (signature === lastSaved.current) return;

    pending.current = { signature, pageId, document };
    const timer = window.setTimeout(() => {
      void saveNow();
    }, 800);

    return () => window.clearTimeout(timer);
  }, [document, loaded, pageId, saveNow]);

  /** Load a page into the canvas, saving the current one first. */
  const openPage = useCallback(
    async (page: Page) => {
      await saveNow();
      const doc = parseDocument(page.content_json, page.title);
      pending.current = null;
      lastSaved.current = JSON.stringify(doc);
      useEditorStore.getState().load(doc);
      setPageId(page.id);
    },
    [saveNow],
  );

  const createPage = useCallback(async () => {
    const title = `Page ${pages.length + 1}`;
    try {
      await saveNow();
      const created = await apiService.createPage(siteId, {
        title,
        slug: `/page-${pages.length + 1}`,
        content_json: { document: createDocument(title) },
      });
      setPages((current) => [...current, created]);
      await openPage(created);
    } catch (reason) {
      useEditorStore.getState().setError(
        reason instanceof Error ? reason.message : 'Unable to create page',
      );
    }
  }, [openPage, pages.length, saveNow, siteId]);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data?.source === 'palette' && data.type) {
      setDragging(PALETTE_BY_TYPE[data.type]?.label ?? data.type);
      return;
    }
    if (data?.nodeId) {
      const node = findNode(useEditorStore.getState().document.root, data.nodeId);
      setDragging(node ? nodeLabel(node) : null);
    }
  };

  /**
   * Resolve a drop into "which container, and at what index".
   *
   * The dragged element's centre relative to the target decides whether the drop
   * lands above, below, or inside it: near an edge places the node as a sibling,
   * through the middle drops it into a container. Dropping onto a zone (or an
   * empty container) appends.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;

    const store = useEditorStore.getState();
    const root = store.document.root;
    const overId = String(over.id);

    let parentId: string;
    let index: number;

    if (overId.startsWith('zone:')) {
      const containerId = overId.slice('zone:'.length);
      const container = findNode(root, containerId);
      if (!container || !canHaveChildren(container.type)) return;
      parentId = containerId;
      index = (container.children ?? []).length;
    } else {
      const overNode = findNode(root, overId);
      const overParent = findParent(root, overId);
      if (!overNode || !overParent) return;

      const activeRect = active.rect.current.translated ?? active.rect.current.initial;
      const centreY = activeRect ? activeRect.top + activeRect.height / 2 : 0;
      const ratio =
        over.rect.height > 0 ? (centreY - over.rect.top) / over.rect.height : 0.5;
      const after = ratio > 0.75;
      const inside = overNode.type !== 'page' && ratio >= 0.25 && ratio <= 0.75;

      if (inside && canHaveChildren(overNode.type)) {
        parentId = overNode.id;
        index = (overNode.children ?? []).length;
      } else {
        const children = overParent.children ?? [];
        const overIndex = children.findIndex((child) => child.id === overId);
        if (overIndex < 0) return;
        parentId = overParent.id;
        index = overIndex + (after ? 1 : 0);
      }
    }

    const activeData = active.data.current as DragData | undefined;

    if (activeData?.source === 'palette' && activeData.type) {
      store.insertNodeAt(parentId, index, nodeFromPalette(activeData.type));
      return;
    }

    const activeId = String(active.id);
    if (activeId === root.id) return;

    // Moving within the same container shifts the target index once the node
    // is lifted out, so compensate.
    const currentParent = findParent(root, activeId);
    if (currentParent?.id === parentId) {
      const currentIndex = (currentParent.children ?? []).findIndex((child) => child.id === activeId);
      if (currentIndex > -1 && currentIndex < index) index -= 1;
    }

    store.moveNode(activeId, parentId, index);
  };

  const publish = useCallback(() => {
    setIsPublishing(true);
    setError(null);
    apiService
      .publishSite(siteId)
      .then((result) => {
        setSite((current) => (current ? { ...current, is_published: true } : current));
        setNotice(result.url ? `Published — ${result.url}` : 'Site published.');
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setIsPublishing(false));
  }, [siteId]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <Toolbar
        siteName={site?.name ?? 'Loading…'}
        publicUrl={publicUrl}
        saveState={saveState}
        isPublishing={isPublishing}
        onPublish={publish}
        onBack={() => router.push('/builder/dashboard')}
        onSettings={() => router.push(`/builder/${siteId}/settings`)}
      />
      <EditorBanner
        error={error}
        notice={notice}
        onDismiss={() => {
          setError(null);
          setNotice(null);
        }}
      />

      <PagesBar
        pages={pages}
        currentPageId={pageId}
        busy={!loaded}
        onSelect={openPage}
        onCreate={createPage}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* The sidebars are unavailable below lg/xl, so offer a drawer instead. */}
        <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2 xl:hidden">
          <button
            type="button"
            onClick={() => setPanel('blocks')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 py-1.5 text-xs font-bold hover:border-ink lg:hidden"
          >
            <Squares2X2Icon className="h-3.5 w-3.5" /> Blocks
          </button>
          <button
            type="button"
            onClick={() => setPanel('inspector')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 py-1.5 text-xs font-bold hover:border-ink"
          >
            <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" /> Inspector
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <Palette className="hidden lg:flex" />
          <Canvas />
          <Inspector className="hidden xl:flex" siteId={siteId} />
        </div>
        <DragOverlay>
          {dragging ? (
            <span className="rounded-full bg-ink px-3 py-1.5 text-[10px] font-bold text-paper shadow-lg">
              {dragging}
            </span>
          ) : null}
        </DragOverlay>

        {panel !== 'none' && (
          <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
            <button
              type="button"
              aria-label="Close panel"
              onClick={() => setPanel('none')}
              className="flex-1 bg-ink/40"
            />
            <div className="flex h-full w-[85vw] max-w-sm flex-col bg-paper shadow-2xl">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
                  {panel === 'blocks' ? 'Blocks' : 'Inspector'}
                </span>
                <button type="button" onClick={() => setPanel('none')} className="text-xs font-bold underline underline-offset-2">
                  Done
                </button>
              </div>
              <div className="flex min-h-0 flex-1 overflow-hidden">
                {panel === 'blocks' ? (
                  <Palette className="w-full border-r-0" onPick={() => setPanel('none')} />
                ) : (
                  <Inspector className="w-full border-l-0" siteId={siteId} />
                )}
              </div>
            </div>
          </div>
        )}
      </DndContext>
    </div>
  );
}
