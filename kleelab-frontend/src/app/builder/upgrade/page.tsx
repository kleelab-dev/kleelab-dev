'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { KleeLabLogo } from '@/components/marketing/KleeLabLogo';
import { UpgradePlans } from '@/components/dashboard/UpgradePlans';

/** Plans and the route to a bigger one. Reachable from the dashboard plan card. */
export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <KleeLabLogo className="h-7 w-auto text-ink" />
            <p className="text-xs text-muted">Plans</p>
          </div>
          <Link
            href="/builder/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 py-2 text-xs font-bold hover:border-ink"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Back to your sites
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-serif text-3xl">Plans</h1>
        <p className="mt-2 max-w-measure text-sm leading-6 text-muted">
          Build anything on any plan. These are the limits, not the features — the editor, the AI
          builder and the published output are the same everywhere.
        </p>
        <div className="mt-8">
          <UpgradePlans />
        </div>
      </div>
    </main>
  );
}
