'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { apiService, ApiError } from '@/services/api';
import { createDocument, parseDocument, type KleeLabDocument } from '@/lib/document';
import { useBuilderStore, type Device, type SaveState } from '@/lib/editor/store';
import { askForChanges } from '@/lib/ai/edit';
import type { Page, Site } from '@/types/api';
import { PagesBar } from '@/components/editor/PagesBar';
import { ChatPanel, type ChatTurn } from './ChatPanel';
import { PreviewFrame } from './PreviewFrame';
import { ReplaceImagePanel } from './ReplaceImagePanel';

const DEVICE_ICONS: Record<Device, typeof ComputerDesktopIcon> = {
  desktop: ComputerDesktopIcon,
  tablet: DeviceTabletIcon,
  mobile: DevicePhoneMobileIcon,
};

const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Not saved',
};

/**
 * The transcript for one page.
 *
 * Kept in the browser rather than on the server, deliberately: turns are a
 * convenience and the document is the record. A lost chat log costs the author a
 * little context; a lost page costs them their site.
 */
function transcriptKey(siteId: string, pageId: string): string {
  return `kl-chat:${siteId}:${pageId}`;
}

function readTranscript(siteId: string, pageId: string): ChatTurn[] {
  try {
    const raw = window.localStorage.getItem(transcriptKey(siteId, pageId));
    return raw ? (JSON.parse(raw) as ChatTurn[]) : [];
  } catch {
    // A corrupt or unreadable entry is not worth a message; an empty transcript
    // is a perfectly usable state.
    return [];
  }
}

function writeTranscript(siteId: string, pageId: string, turns: ChatTurn[]): void {
  try {
    // The last 40 turns only. The transcript is resent with every request as
    // context, so an unbounded one would slowly price the conversation out.
    window.localStorage.setItem(transcriptKey(siteId, pageId), JSON.stringify(turns.slice(-40)));
  } catch {
    // A full quota or a private-mode window must not interrupt the author. The
    // document — the part that matters — is saved on the server regardless.
  }
}

/**
 * The builder.
 *
 * A page on one side, the conversation on the other, and nothing in between. The
 * author does not place blocks, drag sections, or hunt through a settings panel
 * for the right control; they say what they want and watch the page change.
 *
 * What this file is careful about, because the rest depends on it:
 *
 * * **Nothing is lost.** Every change — the assistant's and the author's own —
 *   goes through the store, so it is autosaved and undoable by the same path.
 * * **A failure is visible.** An assistant that cannot be reached says so, rather
 *   than leaving the author to wonder why the page did not change.
 * * **The conversation is not the document.** Turns live in the browser; the
 *   document lives on the server. Losing a chat log is an inconvenience, losing a
 *   page is not.
 */
export function ChatBuilder({ siteId }: { siteId: string }) {
  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [upgradePath, setUpgradePath] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [builderStatus, setBuilderStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [showImageHint, setShowImageHint] = useState(false);

  const document = useBuilderStore((state) => state.document);
  const loaded = useBuilderStore((state) => state.loaded);
  const saveState = useBuilderStore((state) => state.saveState);
  const device = useBuilderStore((state) => state.device);
  const canUndo = useBuilderStore((state) => state.past.length > 0);
  const canRedo = useBuilderStore((state) => state.future.length > 0);
  const lastSaved = useRef('');

  // --- Loading -----------------------------------------------------------------

  useEffect(() => {
    let active = true;
    Promise.all([
      apiService.getSite(siteId),
      apiService.getPages(siteId),
      apiService.getAiStatus().catch(() => null),
    ])
      .then(([loadedSite, loadedPages, status]) => {
        if (!active) return;
        setSite(loadedSite);
        setPages(loadedPages);
        setPublicUrl(loadedSite.subdomain ? `/s/${loadedSite.subdomain}` : null);
        if (status) setBuilderStatus({ available: status.available, reason: status.reason });

        const page =
          loadedPages.find((item) => item.slug === '/' || item.slug === 'home') ?? loadedPages[0];
        if (!page) {
          setError('This site has no pages yet. Create one from the dashboard.');
          return;
        }

        const doc = parseDocument(page.content_json, page.title);
        lastSaved.current = JSON.stringify(doc);
        useBuilderStore.getState().load(doc);
        setPageId(page.id);
        setPageTitle(page.title);
        setTurns(readTranscript(siteId, page.id));
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  // --- Autosave ----------------------------------------------------------------

  const pending = useRef<{ signature: string; pageId: string; document: KleeLabDocument } | null>(null);

  const saveNow = useCallback(async () => {
    const queued = pending.current;
    if (!queued) return;
    pending.current = null;
    const store = useBuilderStore.getState();
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

  // State is only touched from the debounce callback, never in the effect body.
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

  // --- The conversation --------------------------------------------------------

  useEffect(() => {
    if (!pageId) return;
    writeTranscript(siteId, pageId, turns);
  }, [turns, pageId, siteId]);

  const send = useCallback(
    async (instruction: string) => {
      const userTurn: ChatTurn = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: instruction,
      };
      setTurns((current) => [...current, userTurn]);
      setBusy(true);
      setError(null);
      setUpgradePath(null);

      try {
        const result = await askForChanges({
          document: useBuilderStore.getState().document,
          instruction,
          pageTitle,
          history: turns.map((turn) => `${turn.role === 'user' ? 'They' : 'You'}: ${turn.text}`),
        });

        // Applying through the store is what makes the change undoable, autosaved,
        // and rendered — the same path the author's own image swaps take.
        const applied = useBuilderStore.getState().apply(result.operations, result.outline.textKeys);

        const reply: ChatTurn = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: result.summary || 'I could not tell what to change — try saying it another way.',
          changed: applied.applied,
          refused: applied.refused,
        };
        setTurns((current) => [...current, reply]);
        if (applied.applied.length > 0) setShowImageHint(true);
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : 'The assistant could not be reached.';
        if (reason instanceof ApiError && reason.isPlanLimit) setUpgradePath(reason.upgradePath);
        setTurns((current) => [
          ...current,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: message,
            failed: true,
          },
        ]);
        if (reason instanceof ApiError && reason.code === 'ai_not_configured') {
          setBuilderStatus({ available: false, reason: 'not_configured' });
        }
      } finally {
        setBusy(false);
      }
    },
    [pageTitle, turns],
  );

  // --- Pages, publishing, images ----------------------------------------------

  const openPage = useCallback(
    async (page: Page) => {
      if (page.id === pageId) return;
      await saveNow();
      const doc = parseDocument(page.content_json, page.title);
      pending.current = null;
      lastSaved.current = JSON.stringify(doc);
      useBuilderStore.getState().load(doc);
      setPageId(page.id);
      setPageTitle(page.title);
      setTurns(readTranscript(siteId, page.id));
    },
    [pageId, saveNow, siteId],
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
      setError(reason instanceof Error ? reason.message : 'Unable to create page');
    }
  }, [openPage, pages.length, saveNow, siteId]);

  const publish = useCallback(async () => {
    setIsPublishing(true);
    setError(null);
    try {
      await saveNow();
      const result = await apiService.publishSite(siteId);
      setSite((current) => (current ? { ...current, is_published: true } : current));
      setNotice(result.url ? `Published — ${result.url}` : 'Site published.');
    } catch (reason) {
      if (reason instanceof ApiError && reason.isPlanLimit) setUpgradePath(reason.upgradePath);
      setError(reason instanceof Error ? reason.message : 'Unable to publish');
    } finally {
      setIsPublishing(false);
    }
  }, [saveNow, siteId]);

  /**
   * Replace a photograph.
   *
   * Deliberately routed through the same operation the assistant would return, so
   * it is validated, undoable and autosaved by one code path rather than two.
   */
  const replaceImage = useCallback(
    (nodeId: string, url: string, alt: string) => {
      const result = useBuilderStore.getState().apply(
        [{ op: 'set_image', node_id: nodeId, src: url, alt: alt || undefined }],
        {},
      );
      setReplacing(null);
      setShowImageHint(false);
      setTurns((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: result.applied.length > 0 ? 'Swapped that picture for yours.' : 'That picture could not be changed.',
          changed: result.applied,
          refused: result.refused,
          failed: result.applied.length === 0,
        },
      ]);
    },
    [],
  );

  const canBuild = builderStatus?.available !== false;
  const disabledReason = !builderStatus
    ? 'Checking whether the assistant is available…'
    : builderStatus.available
      ? null
      : builderStatus.reason === 'quota_exhausted'
        ? 'You have used your allowance of AI changes for now. Everything you have already built still works.'
        : 'The AI builder is not switched on for this studio yet, so changes need to wait. You can still publish and edit pictures.';

  const DeviceIcon = DEVICE_ICONS[device];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-paper px-4">
        <Link
          href="/builder/dashboard"
          className="text-xs font-bold uppercase tracking-[0.16em] text-muted transition hover:text-ink"
        >
          ← Sites
        </Link>
        <span className="truncate text-sm font-bold">{site?.name ?? 'Loading…'}</span>

        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1 hidden items-center gap-0.5 rounded-full border border-line p-0.5 sm:flex">
            {(Object.keys(DEVICE_ICONS) as Device[]).map((option) => {
              const Icon = DEVICE_ICONS[option];
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => useBuilderStore.getState().setDevice(option)}
                  aria-label={`Preview at ${option} width`}
                  aria-pressed={device === option}
                  className={`rounded-full p-1.5 transition ${
                    device === option ? 'bg-mint text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => useBuilderStore.getState().undo()}
            disabled={!canUndo}
            aria-label="Undo"
            className="rounded-lg p-1.5 text-muted transition hover:text-ink disabled:opacity-30"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => useBuilderStore.getState().redo()}
            disabled={!canRedo}
            aria-label="Redo"
            className="rounded-lg p-1.5 text-muted transition hover:text-ink disabled:opacity-30"
          >
            <ArrowUturnRightIcon className="h-4 w-4" />
          </button>

          <span
            className={`ml-1 hidden text-[11px] md:inline ${
              saveState === 'error' ? 'text-accent' : 'text-muted'
            }`}
          >
            {SAVE_LABEL[saveState]}
          </span>

          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 rounded-lg border border-line px-3 py-1.5 text-xs font-bold transition hover:border-ink"
            >
              View site
            </a>
          )}
          <button
            type="button"
            onClick={publish}
            disabled={isPublishing}
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-paper transition hover:bg-accent disabled:opacity-50"
          >
            {isPublishing ? (
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <DeviceIcon className="h-3.5 w-3.5" />
            )}
            {site?.is_published ? 'Republish' : 'Publish'}
          </button>
        </div>
      </header>

      {(error || notice || upgradePath) && (
        <div
          className={`flex shrink-0 items-center gap-2 border-b px-4 py-2 text-xs ${
            error ? 'border-accent/30 bg-accent/5 text-accent' : 'border-line bg-mint text-ink'
          }`}
        >
          {error && <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">{error ?? notice}</span>
          {upgradePath && (
            <Link href={upgradePath} className="shrink-0 font-bold underline underline-offset-2">
              See plans
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNotice(null);
              setUpgradePath(null);
            }}
            className="shrink-0 font-bold underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <PagesBar
        pages={pages}
        currentPageId={pageId}
        busy={!loaded || busy}
        onSelect={openPage}
        onCreate={createPage}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PreviewFrame
          document={document}
          device={device}
          onReplaceImage={(nodeId) => setReplacing(nodeId)}
          showImageHint={showImageHint}
        />
        <div className="h-80 shrink-0 lg:h-auto lg:w-[26rem] lg:shrink-0">
          <ChatPanel
            turns={turns}
            busy={busy}
            disabled={!canBuild && !busy}
            disabledReason={disabledReason}
            onSend={send}
          />
        </div>
      </div>

      {replacing && (
        <ReplaceImagePanel
          nodeId={replacing}
          onCancel={() => setReplacing(null)}
          onApply={replaceImage}
        />
      )}
    </div>
  );
}
