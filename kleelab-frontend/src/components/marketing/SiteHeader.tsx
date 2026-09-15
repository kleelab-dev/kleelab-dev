'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { ButtonLink } from '@/components/marketing/Button';
import { KleeLabLogo } from '@/components/marketing/KleeLabLogo';
import { primaryNav } from '@/content/site';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Which route the menu was opened on, rather than a plain boolean. Deriving
  // `open` from the pathname means navigating anywhere - including with the
  // back button, which no click handler would catch - closes the panel for
  // free, with no effect and no second render.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  // A menu you can only close with the mouse is a trap for keyboard users.
  // Escape closes it and returns focus to the button that opened it, which is
  // where a keyboard user expects to land.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenOn(null);
      toggleRef.current?.focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="text-ink no-underline" aria-label="KleeLab home">
          {/* Decorative: the link already carries the accessible name, so a
              second one would just be announced twice. */}
          <KleeLabLogo />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={`text-sm transition-colors ${
                isActive(pathname, item.href)
                  ? 'font-medium text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {/* Labelled for where it actually goes. It used to say "Sign in" while
              pointing at the sites dashboard, which carries no sign-in control -
              so the one thing the label promised was the one thing that page
              could not do. */}
          <Link
            href="/builder/dashboard"
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            Your sites
          </Link>
          <ButtonLink href="/builder/new">Start building</ButtonLink>
        </div>

        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="-mr-2 rounded-lg p-2 text-ink md:hidden"
        >
          {open ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="animate-rise border-t border-line bg-paper md:hidden">
          <nav aria-label="Primary mobile" className="mx-auto max-w-content px-6 py-4">
            <ul className="space-y-1">
              {primaryNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpenOn(null)}
                    className="block rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-canvas"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/builder/dashboard"
                  onClick={() => setOpenOn(null)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-canvas"
                >
                  Your sites
                </Link>
              </li>
            </ul>
            <ButtonLink
              href="/builder/new"
              className="mt-3 w-full"
              onClick={() => setOpenOn(null)}
            >
              Start building
            </ButtonLink>
          </nav>
        </div>
      )}
    </header>
  );
}
