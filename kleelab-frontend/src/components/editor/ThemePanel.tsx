'use client';

import { useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { resolveTheme, THEME_SLOTS, type ThemeSlot } from '@/lib/document';
import { useEditorStore } from '@/lib/editor/store';

/**
 * The site's palette.
 *
 * These values become CSS variables on the rendered document, so changing one
 * here restyles every element that uses that slot - in the canvas immediately
 * and on the published site. Individual elements can still override with their
 * own colour, which is the escape hatch for one-offs.
 */
const LABELS: Record<ThemeSlot, string> = {
  paper: 'Page',
  surface: 'Cards',
  canvas: 'Subtle areas',
  mint: 'Tint',
  ink: 'Text',
  muted: 'Secondary text',
  accent: 'Accent',
  line: 'Borders',
};

export function ThemePanel() {
  const [open, setOpen] = useState(false);
  const tokens = useEditorStore((state) => state.document.tokens);
  const updateTheme = useEditorStore((state) => state.updateTheme);
  const resetTheme = useEditorStore((state) => state.resetTheme);

  const theme = resolveTheme(tokens);
  const customised = Object.keys(tokens ?? {}).length > 0;

  return (
    <div className="mb-3 rounded-lg border border-line bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
          Site colours
        </span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open && (
        <div className="grid gap-2.5 border-t border-line px-3 py-3">
          {THEME_SLOTS.map((slot) => (
            <label key={slot} className="flex items-center gap-2.5">
              <input
                type="color"
                aria-label={`${LABELS[slot]} colour`}
                value={theme[slot]}
                onChange={(event) => updateTheme(slot, event.target.value)}
                className="h-6 w-8 shrink-0 cursor-pointer rounded border border-line bg-white"
              />
              <span className="flex-1 text-[10px] leading-4 text-muted">{LABELS[slot]}</span>
              <span className="font-mono text-[9px] uppercase text-muted">{theme[slot]}</span>
            </label>
          ))}

          <p className="text-[10px] leading-4 text-muted">
            Set a colour on a single block to override the palette just for that block.
          </p>

          {customised && (
            <button
              type="button"
              onClick={resetTheme}
              className="justify-self-start text-[10px] text-muted underline underline-offset-2"
            >
              Reset to neutral
            </button>
          )}
        </div>
      )}
    </div>
  );
}
