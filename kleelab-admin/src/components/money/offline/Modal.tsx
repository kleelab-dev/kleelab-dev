'use client';

import { useEffect, useId, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

/**
 * A native modal `<dialog>`: the browser traps focus inside it, Esc closes it
 * and the page behind cannot be tabbed into. Focus returns to the button that
 * opened it.
 */
export function Modal({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** While something is saving, Esc and the backdrop do nothing. */
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    // React's autoFocus runs before the dialog is open, so it does nothing here.
    // Put focus on the marked control, or else the first field, once it is open.
    const first = dialog.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    first?.focus();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
      className="card m-auto w-[calc(100%-1.5rem)] max-w-lg p-0 shadow-block backdrop:bg-ink/40"
    >
      <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-xl font-extrabold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-2.5 -mt-2.5 rounded-full p-2.5 text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-50"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
