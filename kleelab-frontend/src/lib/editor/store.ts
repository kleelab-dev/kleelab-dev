'use client';

import { create } from 'zustand';
import {
  createDocument,
  newNodeId,
  type KleeLabDocument,
  type Node,
  type NodeType,
  type Style,
  type ThemeSlot,
} from '@/lib/document';
import * as tree from './tree';

/**
 * Editor state: the document being edited, selection, undo history, and the
 * device preview. Kept free of side effects so the tree logic stays testable;
 * persistence is handled by the shell component that consumes this store.
 */

export type Device = 'desktop' | 'tablet' | 'mobile';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type StyleTarget = 'base' | 'tablet' | 'mobile';

const HISTORY_LIMIT = 50;

/** Drop undefined entries so a cleared control removes the style key. */
function compact<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ''),
  ) as Partial<T>;
}

interface EditorState {
  document: KleeLabDocument;
  selectedId: string | null;
  device: Device;
  past: KleeLabDocument[];
  future: KleeLabDocument[];
  saveState: SaveState;
  error: string | null;
  loaded: boolean;

  load(document: KleeLabDocument): void;
  select(id: string | null): void;
  setDevice(device: Device): void;
  setSaveState(state: SaveState): void;
  setError(message: string | null): void;

  appendNode(parentId: string, node: Node): void;
  insertNodeAt(parentId: string, index: number, node: Node): void;
  moveNode(id: string, parentId: string, index: number): void;
  removeNode(id: string): void;
  duplicateNode(id: string): void;
  updateProps(id: string, patch: Record<string, unknown>): void;
  updateStyle(id: string, patch: Style, target?: StyleTarget): void;
  updateTheme(slot: ThemeSlot, value: string | undefined): void;
  setTheme(values: Record<string, string>): void;
  resetTheme(): void;

  undo(): void;
  redo(): void;
}

export const useEditorStore = create<EditorState>()((set, get) => {
  /** Apply a tree change and record it as an undo step. */
  const commit = (mutate: (document: KleeLabDocument) => KleeLabDocument) => {
    set((state) => {
      const next = mutate(state.document);
      if (next.root === state.document.root) return state;
      return {
        document: next,
        past: [...state.past, state.document].slice(-HISTORY_LIMIT),
        future: [],
      };
    });
  };

  /**
   * Apply a change outside the tree - the theme, for instance.
   *
   * `commit` compares the root node to decide whether anything happened, which is
   * never true for a theme edit, so this is a separate path rather than a flag.
   */
  const commitDocument = (mutate: (document: KleeLabDocument) => KleeLabDocument) => {
    set((state) => {
      const next = mutate(state.document);
      if (next === state.document) return state;
      return {
        document: next,
        past: [...state.past, state.document].slice(-HISTORY_LIMIT),
        future: [],
      };
    });
  };

  return {
    document: createDocument(),
    selectedId: null,
    device: 'desktop',
    past: [],
    future: [],
    saveState: 'idle',
    error: null,
    loaded: false,

    load: (document) =>
      set({ document, selectedId: document.root.id, past: [], future: [], loaded: true, saveState: 'saved' }),

    select: (id) => set({ selectedId: id }),
    setDevice: (device) => set({ device }),
    setSaveState: (saveState) => set({ saveState }),
    setError: (error) => set({ error }),

    appendNode: (parentId, node) => {
      commit((document) => ({ ...document, root: tree.appendNode(document.root, parentId, node) }));
      set({ selectedId: node.id });
    },

    insertNodeAt: (parentId, index, node) => {
      commit((document) => ({ ...document, root: tree.insertNode(document.root, parentId, index, node) }));
      set({ selectedId: node.id });
    },

    moveNode: (id, parentId, index) => {
      commit((document) => ({ ...document, root: tree.moveNode(document.root, id, parentId, index) }));
    },

    removeNode: (id) => {
      const { document } = get();
      if (document.root.id === id) return; // never delete the page root
      commit((current) => ({ ...current, root: tree.removeNode(current.root, id).root }));
      set((state) => ({ selectedId: state.selectedId === id ? null : state.selectedId }));
    },

    duplicateNode: (id) => {
      const { document } = get();
      const source = tree.findNode(document.root, id);
      const parent = tree.findParent(document.root, id);
      if (!source || !parent) return;

      const copy = tree.cloneWithNewIds(source, (type: NodeType) => newNodeId(type));
      const index = (parent.children ?? []).findIndex((child) => child.id === id) + 1;
      commit((current) => ({ ...current, root: tree.insertNode(current.root, parent.id, index, copy) }));
      set({ selectedId: copy.id });
    },

    updateProps: (id, patch) => {
      const clean = compact(patch);
      commit((document) => ({
        ...document,
        root: tree.updateNode(document.root, id, (node) => ({
          ...node,
          props: { ...node.props, ...clean },
        })),
      }));
    },

    updateStyle: (id, patch, target = 'base') => {
      const clean = compact(patch);
      commit((document) => ({
        ...document,
        root: tree.updateNode(document.root, id, (node) => {
          if (target === 'base') {
            const style = { ...node.style, ...clean } as Style;
            for (const key of Object.keys(clean) as (keyof Style)[]) {
              if (clean[key] === undefined) delete style[key];
            }
            return { ...node, style };
          }

          const responsive = { ...(node.responsive ?? {}) };
          const existing = { ...(responsive[target] ?? {}) } as Style;
          Object.assign(existing, clean);
          for (const key of Object.keys(clean) as (keyof Style)[]) {
            if (clean[key] === undefined) delete existing[key];
          }
          responsive[target] = existing;
          return { ...node, responsive };
        }),
      }));
    },

    updateTheme: (slot, value) => {
      commitDocument((document) => {
        const tokens = { ...(document.tokens ?? {}) };
        if (value && value.trim()) tokens[slot] = value.trim();
        else delete tokens[slot];
        return { ...document, tokens };
      });
    },

    resetTheme: () => commitDocument((document) => ({ ...document, tokens: {} })),

    setTheme: (values) =>
      commitDocument((document) => ({
        ...document,
        tokens: { ...(document.tokens ?? {}), ...values },
      })),

    undo: () =>
      set((state) => {
        const previous = state.past.at(-1);
        if (!previous) return state;
        return {
          document: previous,
          past: state.past.slice(0, -1),
          future: [state.document, ...state.future].slice(0, HISTORY_LIMIT),
        };
      }),

    redo: () =>
      set((state) => {
        const [next, ...rest] = state.future;
        if (!next) return state;
        return {
          document: next,
          past: [...state.past, state.document].slice(-HISTORY_LIMIT),
          future: rest,
        };
      }),
  };
});
