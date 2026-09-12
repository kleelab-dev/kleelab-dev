/**
 * Shown where a storefront node sits in the editor.
 *
 * The editor has no catalogue to render, and the alternative - rendering an
 * empty grid - would look like a broken block rather than a working one.
 */
export function BlockPlaceholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-canvas px-4 py-8 text-center">
      <p className="font-mono text-[10px] uppercase tracking-label text-muted">{label}</p>
      <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted">{hint}</p>
    </div>
  );
}
