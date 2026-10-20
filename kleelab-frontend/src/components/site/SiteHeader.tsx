'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { primaryNav } from '@/content/site';
import { useHasSession } from '@/lib/useHasSession';
import { ButtonLink } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

export function SiteHeader() {
  const pathname = usePathname();
  const signedIn = useHasSession();
  const [open, setOpen] = useState(false);

  // Close the mobile menu after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const account = signedIn
    ? { href: '/dashboard', label: 'Dashboard' }
    : { href: '/login', label: 'Client login' };

  return (
    <header className="sticky top-0 z-40 border-b-[1.5px] border-ink bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="KleeLab home" className="no-underline">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {primaryNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'relative text-sm font-medium no-underline transition-colors',
                  active ? 'text-cobalt' : 'text-ink/75 hover:text-ink',
                )}
              >
                {item.label}
                {active && <span className="absolute -bottom-1.5 left-0 right-0 h-[2px] rounded bg-cobalt" />}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href={account.href} className="font-mono text-xs uppercase tracking-label text-ink no-underline hover:text-cobalt">
            {account.label}
          </Link>
          <ButtonLink href="/contact" size="sm">
            Start a project
          </ButtonLink>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-full border-[1.5px] border-ink lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="kl-rise border-t-[1.5px] border-ink bg-paper px-5 pb-6 pt-3 lg:hidden">
          <ul className="grid">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between border-b border-line py-3.5 font-display text-2xl font-bold no-underline"
                >
                  {item.label}
                  <span className="font-mono text-xs text-cobalt">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid gap-3">
            <ButtonLink href="/contact" size="lg">
              Start a project
            </ButtonLink>
            <ButtonLink href={account.href} variant="secondary" size="lg">
              {account.label}
            </ButtonLink>
          </div>
        </nav>
      )}
    </header>
  );
}
