'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { Logo } from '@/components/marketing/Logo';
import { primaryNav } from '@/content/site';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="text-ink no-underline" aria-label="KleeLab home">
          <Logo />
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
          <Link
            href="/builder/dashboard"
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/builder/new"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-soft"
          >
            Start building
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="-mr-2 rounded-lg p-2 text-ink md:hidden"
        >
          {open ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-line bg-paper md:hidden">
          <nav aria-label="Primary mobile" className="mx-auto max-w-content px-6 py-4">
            <ul className="space-y-1">
              {primaryNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-canvas"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/builder/dashboard"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-canvas"
                >
                  Sign in
                </Link>
              </li>
            </ul>
            <Link
              href="/builder/new"
              onClick={() => setOpen(false)}
              className="mt-3 block rounded-full bg-ink px-4 py-2.5 text-center text-sm font-medium text-paper"
            >
              Start building
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
