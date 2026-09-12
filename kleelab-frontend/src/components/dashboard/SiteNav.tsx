'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Tab bar shared by every per-site admin page.
 *
 * Products and orders were previously unreachable from anywhere: the only way
 * into a site was the editor, and the editor only links to settings. Keeping the
 * tabs in one component means adding a page cannot half-wire the navigation.
 */
const TABS = [
  { segment: 'edit', label: 'Editor' },
  { segment: 'products', label: 'Products' },
  { segment: 'orders', label: 'Orders' },
  { segment: 'settings', label: 'Settings' },
] as const;

export function SiteNav({ siteId }: { siteId: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Site sections" className="flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const href = `/builder/${siteId}/${tab.segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.segment}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${
              active ? 'bg-ink text-paper' : 'text-muted hover:bg-canvas hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Header used by the per-site pages that are not the editor itself. */
export function SitePageShell({
  siteId,
  siteName,
  title,
  description,
  actions,
  children,
}: {
  siteId: string;
  siteName: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Link
                href="/builder/dashboard"
                className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted hover:text-ink"
              >
                ← All sites
              </Link>
              <h1 className="mt-2 font-serif text-2xl leading-tight">{title}</h1>
              <p className="mt-1 text-xs text-muted">
                {/* Joined rather than concatenated: the site name is absent until
                    the site loads, which would otherwise leave a stray "·". */}
                {[siteName, description].filter(Boolean).join(' · ')}
              </p>
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>

          <div className="mt-5">
            <SiteNav siteId={siteId} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
