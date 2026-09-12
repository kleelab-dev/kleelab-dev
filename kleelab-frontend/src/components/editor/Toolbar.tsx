'use client';

import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline';
import { useEditorStore, type Device, type SaveState } from '@/lib/editor/store';

const DEVICES: { value: Device; label: string; Icon: typeof ComputerDesktopIcon }[] = [
  { value: 'desktop', label: 'Desktop', Icon: ComputerDesktopIcon },
  { value: 'tablet', label: 'Tablet', Icon: DeviceTabletIcon },
  { value: 'mobile', label: 'Mobile', Icon: DevicePhoneMobileIcon },
];

type Props = {
  siteName: string;
  publicUrl: string | null;
  saveState: SaveState;
  isPublishing: boolean;
  onPublish: () => void;
  onBack: () => void;
  onSettings: () => void;
};

const SAVE_LABEL: Record<SaveState, string> = {
  idle: 'Ready',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Save failed',
};

export function Toolbar({ siteName, publicUrl, saveState, isPublishing, onPublish, onBack, onSettings }: Props) {
  const device = useEditorStore((state) => state.device);
  const setDevice = useEditorStore((state) => state.setDevice);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore((state) => state.past.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-paper px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-canvas"
          title="Back to your sites"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <span className="truncate text-sm font-bold">{siteName}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          className="rounded-md p-2 text-muted hover:bg-canvas hover:text-ink disabled:opacity-35"
          title="Undo"
        >
          <ArrowUturnLeftIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          className="rounded-md p-2 text-muted hover:bg-canvas hover:text-ink disabled:opacity-35"
          title="Redo"
        >
          <ArrowUturnLeftIcon className="h-4 w-4 -scale-x-100" />
        </button>
        <span className="mx-2 h-5 w-px bg-line" />
        {DEVICES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setDevice(value)}
            aria-pressed={device === value}
            className={`rounded-md p-2 ${device === value ? 'bg-mint text-ink' : 'text-muted hover:bg-canvas'}`}
            title={`${label} preview`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span
          role="status"
          aria-live="polite"
          className={`hidden text-xs sm:block ${saveState === 'error' ? 'font-semibold text-accent' : 'text-muted'}`}
        >
          {SAVE_LABEL[saveState]}
        </span>
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 py-2 text-xs font-bold hover:border-ink sm:inline-flex"
          >
            <EyeIcon className="h-4 w-4" /> View site
          </a>
        )}
        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishing}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {isPublishing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <RocketLaunchIcon className="h-4 w-4" />}
          {isPublishing ? 'Publishing…' : 'Publish'}
        </button>
        <button
          type="button"
          onClick={onSettings}
          className="rounded-lg border border-line-strong bg-white p-2 text-muted hover:border-ink hover:text-ink"
          title="Site settings"
        >
          <Cog6ToothIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

export function EditorBanner({
  error,
  notice,
  onDismiss,
}: {
  error: string | null;
  notice: string | null;
  onDismiss: () => void;
}) {
  if (!error && !notice) return null;
  const isError = Boolean(error);
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-start gap-2 border-b px-4 py-2 text-xs ${
        isError ? 'border-danger-line bg-danger-surface text-danger' : 'border-success-line bg-success-surface text-success'
      }`}
    >
      {isError ? (
        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">{error ?? notice}</span>
      <button type="button" onClick={onDismiss} className="font-bold underline underline-offset-2">
        Dismiss
      </button>
    </div>
  );
}
