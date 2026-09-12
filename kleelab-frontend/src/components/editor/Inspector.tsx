'use client';

/* eslint-disable @next/next/no-img-element -- previews arbitrary user-supplied
   and Cloudinary-hosted image URLs. */

import { useState } from 'react';
import { DocumentDuplicateIcon, TrashIcon } from '@heroicons/react/24/outline';
import {
  ALIGNMENTS,
  BACKGROUND_TONES,
  MAX_WIDTHS,
  RADII,
  SHADOWS,
  SPACE_SCALE,
  TEXT_SIZES,
  TEXT_TONES,
  type Node,
  type Style,
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

function LayoutControls({ node }: { node: Node }) {
  const updateStyle = useEditorStore((state) => state.updateStyle);
  const target = useEditorStore((state) => state.device === 'desktop' ? 'base' : state.device) as StyleTarget;

  const current: Style =
    target === 'base' ? (node.style ?? {}) : (node.responsive?.[target] ?? {});

  const set = (patch: Style) => updateStyle(node.id, patch, target);

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

      <SelectField label="Background" value={current.background} options={BACKGROUND_TONES} onChange={(background) => set({ background })} />
      <SelectField label="Text colour" value={current.color} options={TEXT_TONES} onChange={(color) => set({ color })} />
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
