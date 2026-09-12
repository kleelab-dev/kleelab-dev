'use client';

/* eslint-disable @next/next/no-img-element -- previews arbitrary user-supplied
   and Cloudinary-hosted image URLs. */

import { useState } from 'react';
import { DocumentDuplicateIcon, TrashIcon } from '@heroicons/react/24/outline';
import {
  ALIGNMENTS,
  BORDER_WIDTHS,
  MAX_WIDTHS,
  PRESET_COLOURS,
  RADII,
  SHADOWS,
  SPACE_SCALE,
  TEXT_SIZES,
  THEME_SLOTS,
  resolveTheme,
  type Node,
  type SiteTheme,
  type Style,
  type ThemeSlot,
} from '@/lib/document';
import { useEditorStore, type StyleTarget } from '@/lib/editor/store';
import { apiService } from '@/services/api';
import { useSelectedNode } from '@/components/editor/Canvas';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none focus:border-accent';

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Field label={label}>
      <input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function AreaField({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}) {
  return (
    <Field label={label}>
      <textarea
        className={`${inputClass} resize-y`}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/** Boolean prop, rendered as a checkbox rather than a Yes/No dropdown. */
function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Field label={label}>
      <span className="flex items-center gap-2.5 text-xs text-ink">
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-line accent-accent"
        />
        {value ? 'Shown' : 'Hidden'}
      </span>
    </Field>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: readonly T[];
  onChange: (next: T | undefined) => void;
}) {
  return (
    <Field label={label}>
      <select
        className={inputClass}
        value={value ?? ''}
        onChange={(event) => onChange((event.target.value || undefined) as T | undefined)}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' ? value : fallback;
const asLines = (value: unknown): string =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string').join('\n') : '';

/** Image source plus an upload control backed by the assets API. */
function ImageControls({ node, siteId }: { node: Node; siteId: string | null }) {
  const updateProps = useEditorStore((state) => state.updateProps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = asString(node.props.src);

  const upload = async (file: File | undefined) => {
    if (!file || !siteId) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
      });
      const asset = await apiService.uploadAsset(siteId, { filename: file.name, data: dataUrl });
      updateProps(node.id, { src: asset.url, alt: asString(node.props.alt) || file.name });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      <TextField
        label="Image URL"
        value={src}
        onChange={(value) => updateProps(node.id, { src: value })}
      />
      <TextField
        label="Alt text"
        value={asString(node.props.alt)}
        onChange={(alt) => updateProps(node.id, { alt })}
      />
      <Field label="Upload from your device">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          disabled={busy || !siteId}
          onChange={(event) => void upload(event.target.files?.[0])}
          className="w-full text-[11px]"
        />
      </Field>
      {busy && <p className="text-[10px] text-muted">Uploading…</p>}
      {error && <p className="text-[10px] leading-4 text-danger">{error}</p>}
      {src && (
        <img src={src} alt="" className="h-24 w-full rounded-lg object-cover ring-1 ring-line" />
      )}
    </div>
  );
}

/** Content controls depend on the node type. */
function ContentControls({ node, siteId }: { node: Node; siteId: string | null }) {
  const updateProps = useEditorStore((state) => state.updateProps);
  const set = (patch: Record<string, unknown>) => updateProps(node.id, patch);

  switch (node.type) {
    case 'heading':
      return (
        <>
          <AreaField label="Text" value={asString(node.props.text)} onChange={(text) => set({ text })} rows={2} />
          <SelectField
            label="Level"
            value={String(asNumber(node.props.level, 2)) as '1' | '2' | '3' | '4'}
            options={['1', '2', '3', '4'] as const}
            onChange={(level) => set({ level: level ? Number(level) : 2 })}
          />
        </>
      );
    case 'text':
      return <AreaField label="Text" value={asString(node.props.text)} onChange={(text) => set({ text })} rows={5} />;
    case 'button':
    case 'link':
      return (
        <>
          <TextField label="Label" value={asString(node.props.label)} onChange={(label) => set({ label })} />
          <TextField label="Link" value={asString(node.props.href)} onChange={(href) => set({ href })} />
        </>
      );
    case 'image':
      return <ImageControls node={node} siteId={siteId} />;
    case 'list':
      return (
        <AreaField
          label="Items (one per line)"
          value={asLines(node.props.items)}
          rows={5}
          onChange={(value) => set({ items: value.split('\n').map((line) => line.trim()).filter(Boolean) })}
        />
      );
    case 'spacer':
      return (
        <SelectField
          label="Size"
          value={asString(node.props.size) as (typeof SPACE_SCALE)[number]}
          options={SPACE_SCALE}
          onChange={(size) => set({ size: size ?? 'md' })}
        />
      );
    case 'nav':
      return <TextField label="Brand" value={asString(node.props.brand)} onChange={(brand) => set({ brand })} />;
    case 'product_grid':
      return (
        <>
          <SelectField
            label="Columns"
            value={String(asNumber(node.props.columns, 3)) as '1' | '2' | '3' | '4'}
            options={['1', '2', '3', '4'] as const}
            onChange={(columns) => set({ columns: columns ? Number(columns) : 3 })}
          />
          <ToggleField
            label="Prices"
            value={node.props.showPrices !== false}
            onChange={(showPrices) => set({ showPrices })}
          />
        </>
      );
    case 'cart_button':
      return (
        <TextField label="Label" value={asString(node.props.label)} onChange={(label) => set({ label })} />
      );
    case 'footer':
      return <TextField label="Text" value={asString(node.props.text)} onChange={(text) => set({ text })} />;
    case 'form':
      return (
        <p className="rounded-lg bg-canvas p-3 text-[10px] leading-4 text-muted">
          This form has {Array.isArray(node.props.fields) ? node.props.fields.length : 0} fields.
          Field editing arrives with the form block work.
        </p>
      );
    default:
      return (
        <p className="rounded-lg bg-canvas p-3 text-[10px] leading-4 text-muted">
          No content options for this block — use the layout controls below.
        </p>
      );
  }
}

const TARGETS: { value: StyleTarget; label: string }[] = [
  { value: 'base', label: 'All' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'mobile', label: 'Mobile' },
];

const THEME_SLOT_LABELS: Record<ThemeSlot, string> = {
  paper: 'Page',
  surface: 'Card',
  canvas: 'Subtle',
  mint: 'Tint',
  ink: 'Text',
  muted: 'Muted',
  accent: 'Accent',
  line: 'Border',
};

/**
 * Colour control.
 *
 * Offers the site's own palette as swatches, plus a free colour picker and a
 * text field. Anything the text field accepts that is a valid CSS colour is
 * used verbatim, so a site is not limited to the palette.
 */
function ColourField({
  label,
  value,
  theme,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string | undefined;
  theme: SiteTheme;
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
}) {
  const isSlot =
    typeof value === 'string' && (THEME_SLOTS as readonly string[]).includes(value);
  // Show the colour actually in effect. Reading '#000000' for a slot was
  // misleading - it looked like the control was empty or broken.
  const resolved = isSlot ? theme[value as ThemeSlot] : value;
  const pickerValue =
    typeof resolved === 'string' && resolved.startsWith('#') ? resolved : '#000000';

  return (
    <Field label={label}>
      <div className="grid gap-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">Palette</p>
        <div className="flex flex-wrap gap-1.5">
          {THEME_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              onClick={() => onChange(value === slot ? undefined : slot)}
              title={`${THEME_SLOT_LABELS[slot]} (follows your palette)`}
              className={`h-6 w-6 rounded-md border transition ${
                value === slot ? 'border-2 border-accent' : 'border-line'
              } disabled:opacity-40`}
              style={{ backgroundColor: theme[slot] }}
            >
              <span className="sr-only">{THEME_SLOT_LABELS[slot]} colour</span>
            </button>
          ))}
        </div>

        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">Any colour</p>
        <div className="flex flex-wrap gap-1">
          {PRESET_COLOURS.map((colour) => (
            <button
              key={colour}
              type="button"
              disabled={disabled}
              onClick={() => onChange(colour)}
              title={colour}
              aria-label={`Use ${colour}`}
              className={`h-4 w-4 rounded-sm border transition ${
                value === colour ? 'border-2 border-accent' : 'border-line'
              } disabled:opacity-40`}
              style={{ backgroundColor: colour }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} custom colour`}
            disabled={disabled}
            value={pickerValue}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 w-9 shrink-0 cursor-pointer rounded border border-line bg-white disabled:opacity-40"
          />
          <input
            className={inputClass}
            disabled={disabled}
            value={value ?? ''}
            placeholder="theme name or #hex"
            onChange={(event) => onChange(event.target.value.trim() || undefined)}
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="shrink-0 text-[10px] text-muted underline"
            >
              clear
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}

function LayoutControls({ node }: { node: Node }) {
  const updateStyle = useEditorStore((state) => state.updateStyle);
  const tokens = useEditorStore((state) => state.document?.tokens);
  const target = useEditorStore((state) => state.device === 'desktop' ? 'base' : state.device) as StyleTarget;

  const theme = resolveTheme(tokens);
  const current: Style =
    target === 'base' ? (node.style ?? {}) : (node.responsive?.[target] ?? {});

  const set = (patch: Style) => updateStyle(node.id, patch, target);
  // Colours cannot be expressed as breakpoint classes, so they apply to every
  // screen. Offering them on a breakpoint tab would silently do nothing.
  const coloursDisabled = target !== 'base';

  return (
    <div className="grid gap-3">
      <div className="flex gap-1 rounded-lg bg-canvas p-1">
        {TARGETS.map((item) => (
          <span
            key={item.value}
            className={`flex-1 rounded-md px-2 py-1 text-center text-[10px] font-bold ${
              target === item.value ? 'bg-white text-ink shadow-sm' : 'text-muted'
            }`}
          >
            {item.label}
          </span>
        ))}
      </div>
      <p className="text-[10px] leading-4 text-muted">
        Editing <strong className="text-ink">{target === 'base' ? 'all screens' : target}</strong>.
        Switch the preview device in the toolbar to target a breakpoint.
      </p>

      <ColourField
        label="Background"
        value={node.style?.background}
        theme={theme}
        disabled={coloursDisabled}
        onChange={(background) => updateStyle(node.id, { background }, 'base')}
      />
      <ColourField
        label="Text colour"
        value={node.style?.color}
        theme={theme}
        disabled={coloursDisabled}
        onChange={(color) => updateStyle(node.id, { color }, 'base')}
      />
      <ColourField
        label="Border colour"
        value={node.style?.borderColor}
        theme={theme}
        disabled={coloursDisabled}
        onChange={(borderColor) => updateStyle(node.id, { borderColor }, 'base')}
      />
      {coloursDisabled && (
        <p className="rounded-lg bg-canvas p-2.5 text-[10px] leading-4 text-muted">
          Colours apply to all screens, so they are edited on the “All” tab.
        </p>
      )}
      <SelectField label="Border width" value={current.borderWidth} options={BORDER_WIDTHS} onChange={(borderWidth) => set({ borderWidth })} />
      <SelectField label="Align" value={current.align} options={ALIGNMENTS} onChange={(align) => set({ align })} />
      <SelectField label="Text size" value={current.size} options={TEXT_SIZES} onChange={(size) => set({ size })} />
      <SelectField label="Padding Y" value={current.paddingY} options={SPACE_SCALE} onChange={(paddingY) => set({ paddingY })} />
      <SelectField label="Padding X" value={current.paddingX} options={SPACE_SCALE} onChange={(paddingX) => set({ paddingX })} />
      <SelectField label="Gap" value={current.gap} options={SPACE_SCALE} onChange={(gap) => set({ gap })} />
      <SelectField label="Radius" value={current.radius} options={RADII} onChange={(radius) => set({ radius })} />
      <SelectField label="Shadow" value={current.shadow} options={SHADOWS} onChange={(shadow) => set({ shadow })} />
      <SelectField label="Max width" value={current.maxWidth} options={MAX_WIDTHS} onChange={(maxWidth) => set({ maxWidth })} />
    </div>
  );
}

export function Inspector({ className = '', siteId }: { className?: string; siteId: string | null }) {
  const node = useSelectedNode();
  const duplicateNode = useEditorStore((state) => state.duplicateNode);
  const removeNode = useEditorStore((state) => state.removeNode);

  if (!node) {
    return (
      <aside className={`w-72 shrink-0 border-l border-line bg-paper p-4 ${className}`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Inspector</p>
        <p className="mt-3 text-xs leading-5 text-muted">
          Select a block on the canvas to edit its content and layout.
        </p>
      </aside>
    );
  }

  const isRoot = node.type === 'page';

  return (
    <aside className={`flex w-72 shrink-0 flex-col overflow-y-auto border-l border-line bg-paper p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
          {node.type}
        </p>
        {!isRoot && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => duplicateNode(node.id)}
              className="rounded-md p-1 text-muted hover:bg-canvas hover:text-ink"
              title="Duplicate"
            >
              <DocumentDuplicateIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => removeNode(node.id)}
              className="rounded-md p-1 text-accent hover:bg-danger-surface"
              title="Delete"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 border-b border-line pb-4">
        <ContentControls node={node} siteId={siteId} />
      </div>

      <div className="mt-4">
        <LayoutControls node={node} />
      </div>
    </aside>
  );
}
