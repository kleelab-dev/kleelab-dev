'use client';

import { useCallback, useState } from 'react';
import { PhotoIcon } from '@heroicons/react/24/outline';
import type { KleeLabDocument } from '@/lib/document';
import { DocumentRenderer } from '@/components/render/registry';
import type { Device } from '@/lib/editor/store';

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: '100%',
  tablet: '48rem',
  mobile: '24rem',
};

/**
 * The page as it will look, rendered through the same registry the published site
 * uses — so what the author watches the assistant change is what visitors get,
 * not an approximation of it.
 *
 * Two things are intercepted here rather than in the renderer:
 *
 * * **Links do not navigate.** A preview full of dead-ends is not a preview.
 * * **Clicking a photograph offers to replace it.** This is the one manual
 *   affordance left, and it is not a compromise: the assistant can describe a
 *   picture but it cannot supply the business's own photographs, and a site of
 *   borrowed stock images is not the site they wanted. Replacing one goes
 *   through the same validated, undoable path the assistant's own changes use.
 */
export function PreviewFrame({
  document,
  device,
  onReplaceImage,
  showImageHint,
}: {
  document: KleeLabDocument;
  device: Device;
  onReplaceImage: (nodeId: string) => void;
  /** Show the hint about swapping in the business's own photographs. */
  showImageHint: boolean;
}) {
  const [hovering, setHovering] = useState(false);

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const element = event.target as HTMLElement | null;
      if (!element) return;

      const image = element.closest('[data-kl-image]');
      if (image) {
        event.preventDefault();
        const id = image.getAttribute('data-kl-image');
        if (id) onReplaceImage(id);
        return;
      }

      // Any other link in the preview would take the author away from the builder.
      if (element.closest('a')) event.preventDefault();
    },
    [onReplaceImage],
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4">
      <div
        className="mx-auto overflow-hidden rounded-xl border border-line bg-white shadow-sm"
        style={{ maxWidth: DEVICE_WIDTH[device] }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div onClick={onClick} className={hovering ? 'kl-preview-live' : undefined}>
          <DocumentRenderer document={document} />
        </div>
      </div>

      {showImageHint && (
        <p className="mx-auto mt-3 flex max-w-md items-center justify-center gap-1.5 text-center text-[11px] text-muted">
          <PhotoIcon className="h-3.5 w-3.5" />
          Changed a moment ago. Hover a photograph and click it to use your own.
        </p>
      )}
    </div>
  );
}
