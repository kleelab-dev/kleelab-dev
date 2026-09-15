'use client';

import { create } from 'zustand';
import { createDocument, type KleeLabDocument } from '@/lib/document';
import type { AiEditOperation } from '@/types/api';
import { applyOperations, type ApplyResult } from './operations';

/**
 * Builder state.
 *
 * This used to be an editor store: a selection, a device, and a dozen actions for
 * placing, moving and restyling nodes by hand. All of that is gone, because the
 * page is no longer built by hand — it is described to the assistant and changed
 * by applying what the assistant returns. What remains is what a document
 * genuinely needs: the document, its undo history, and whether it is saved.
 *
 * Undo matters more here than it did in the editor, not less. A hand edit is one
 * gesture the author made and watched happen; one sentence can change eight
 * things at once, so the history is the only way to answer "what did that just do
 * to my site".
 */

export type Device = 'desktop' | 'tablet' | 'mobile';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const HISTORY_LIMIT = 50;

interface BuilderState {
  document: KleeLabDocument;
  past: KleeLabDocument[];
  future: KleeLabDocument[];
  device: Device;
  saveState: SaveState;
  error: string | null;
  loaded: boolean;

  load(document: KleeLabDocument): void;
  setDevice(device: Device): void;
  setSaveState(saveState: SaveState): void;
  setError(error: string | null): void;

  /**
   * Apply one turn's changes.
   *
   * Returns what was applied and what was not, so the chat can say so. The
   * document is only replaced when something actually changed, so a turn full of
   * refusals leaves the undo history alone rather than adding an empty step the
   * author has to press through to get back where they were.
   */
  apply(operations: AiEditOperation[], textKeys: Record<string, string>): ApplyResult;

  undo(): void;
  redo(): void;
}

export const useBuilderStore = create<BuilderState>()((set, get) => ({
  document: createDocument(),
  past: [],
  future: [],
  device: 'desktop',
  saveState: 'idle',
  error: null,
  loaded: false,

  load: (document) =>
    set({ document, past: [], future: [], loaded: true, saveState: 'saved', error: null }),

  setDevice: (device) => set({ device }),
  setSaveState: (saveState) => set({ saveState }),
  setError: (error) => set({ error }),

  apply: (operations, textKeys) => {
    const current = get().document;
    const result = applyOperations(current, operations, textKeys);
    if (result.document !== current) {
      const next = result.document;
      set((state) => ({
        document: next,
        past: [...state.past, current].slice(-HISTORY_LIMIT),
        future: [],
      }));
    }
    return result;
  },

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
}));
