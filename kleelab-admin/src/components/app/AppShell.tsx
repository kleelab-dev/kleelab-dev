'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Logo } from '@/components/ui/Logo';
import { AlertsBell } from '@/components/app/AlertsBell';
import { CommandPalette } from '@/components/app/CommandPalette';
import { ApiError, apiService, hasSession } from '@/services/api';
import type { User } from '@/types/api';

const UserContext = createContext<{ user: User; setUser: (user: User) => void } | null>(null);

/** The signed-in user. Only valid below an AppShell, which renders nothing until it is known. */
export function useCurrentUser(): User {
  const value = useContext(UserContext);
  if (!value) throw new Error('useCurrentUser must be used inside AppShell');
  return value.user;
}

/** Replace the signed-in user after a change to their own account, such as turning on two-step. */
export function useUpdateUser(): (user: User) => void {
  const value = useContext(UserContext);
  if (!value) throw new Error('useUpdateUser must be used inside AppShell');
  return value.setUser;
}

type State = { kind: 'loading' } | { kind: 'ready'; user: User } | { kind: 'failed'; message: string };

const NAV = [
  { href: '/', label: 'Today' },
  { href: '/projects', label: 'Projects' },
  { href: '/leads', label: 'Enquiries' },
  { href: '/calls', label: 'Calls' },
  { href: '/clients', label: 'Clients' },
  { href: '/money', label: 'Money' },
  { href: '/time', label: 'Time' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/library', label: 'Library' },
];

const MENU = [
  { href: '/account', label: 'Your account' },
  { href: '/team', label: 'Team' },
  { href: '/activity', label: 'Activity' },
];

function initials(user: User): string {
  const source = user.full_name?.trim() || user.email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (user.full_name ? (parts[1]?.[0] ?? '') : '')).toUpperCase() || '?';
}

/**
 * Frame for every team page: checks the session, sends strangers to the login
 * page with a way back, and turns away signed-in clients. The API refuses their
 * /api/admin calls anyway; this only spares them a page that cannot load.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const staff = state.kind === 'ready' && state.user.role === 'staff';

  // On a phone the nav can scroll sideways; keep the current page in view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname, state.kind]);

  useEffect(() => {
    let active = true;
    const toLogin = () => router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (!hasSession()) {
      toLogin();
      return;
    }
    apiService
      .getCurrentUser()
      .then((user) => {
        if (active) setState({ kind: 'ready', user });
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) return toLogin();
        setState({ kind: 'failed', message: reason instanceof Error ? reason.message : 'Unable to load your account.' });
      });
    return () => {
      active = false;
    };
    // Only on entry: navigating between signed-in pages keeps the same user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+K or ⌘K opens search from anywhere, even while typing in a field.
  useEffect(() => {
    if (!staff) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMenuOpen(false);
        setSearching((open) => !open);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [staff]);

  // Close the account menu on outside clicks and Escape; its links close it themselves.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function signOut() {
    await apiService.logout().catch(() => undefined);
    router.replace('/login');
  }

  if (state.kind === 'loading') {
    return (
      <main className="bg-graph grid min-h-screen place-items-center">
        <p className="font-mono text-[11px] uppercase tracking-label text-muted">
          <span className="kl-dot mr-2 inline-block h-2 w-2 rounded-full bg-cobalt" />
          Loading the team dashboard
        </p>
      </main>
    );
  }

  if (state.kind === 'failed') {
    return (
      <main className="bg-graph grid min-h-screen place-items-center px-5">
        <div className="card max-w-md p-7 text-center">
          <p className="font-display text-2xl font-extrabold">We could not load your account</p>
          <p className="mt-2 text-sm text-muted">{state.message}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 text-sm font-semibold text-cobalt">
            Try again
          </button>
        </div>
      </main>
    );
  }

  const { user } = state;
  const setUser = (next: User) => setState({ kind: 'ready', user: next });
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <div className="bg-graph min-h-screen text-ink">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b-[1.5px] border-ink bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:gap-x-6 sm:px-5 sm:py-3.5">
            <Link href="/" className="no-underline" aria-label="Team dashboard home">
              <Logo />
            </Link>
            <span className="stamp hidden -rotate-2 sm:inline-block">Team</span>
            {staff && (
              <nav
                ref={navRef}
                className="-mx-1 order-last flex min-w-0 basis-full items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] lg:order-none lg:flex-1 lg:basis-auto [&::-webkit-scrollbar]:hidden"
                aria-label="Dashboard"
              >
                {NAV.map((item) => {
                  const current = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={current ? 'page' : undefined}
                      className={clsx(
                        'shrink-0 rounded-full px-2.5 py-1.5 text-sm font-medium no-underline sm:px-3',
                        current ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5',
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-2">
              {staff && (
                <button
                  type="button"
                  onClick={() => setSearching(true)}
                  className="flex items-center gap-2 rounded-full border-[1.5px] border-line bg-white px-3 py-1.5 text-sm text-muted hover:border-ink"
                  aria-label="Search"
                  aria-keyshortcuts="Control+K Meta+K"
                >
                  <MagnifyingGlassIcon className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Search</span>
                  <kbd className="hidden font-mono text-[10px] md:inline">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
                </button>
              )}
              {staff && <AlertsBell />}
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label={`Account menu for ${user.full_name || user.email}`}
                  className={clsx(
                    'grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-ink font-mono text-xs font-semibold',
                    menuOpen ? 'bg-ink text-paper' : 'bg-sun',
                  )}
                >
                  {initials(user)}
                </button>
                {menuOpen && (
                  <div role="menu" className="card absolute right-0 top-full z-40 mt-2 w-64 p-2 shadow-block">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-semibold">{user.full_name || 'No name yet'}</p>
                      <p className="truncate text-xs text-muted">{user.email}</p>
                      {staff && !user.two_step_enabled && (
                        <p className="mt-1 text-xs font-semibold text-danger">Two-step sign-in is off</p>
                      )}
                    </div>
                    {staff &&
                      MENU.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setMenuOpen(false)}
                          aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                          className="block rounded-lg px-3 py-2 text-sm no-underline hover:bg-ink/5 aria-[current=page]:font-semibold"
                        >
                          {item.label}
                        </Link>
                      ))}
                    <button type="button" role="menuitem" onClick={signOut} className="mt-1 block w-full rounded-lg border-t-[1.5px] border-line px-3 py-2 text-left text-sm hover:bg-ink/5">
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-content px-4 py-8 sm:px-5 sm:py-12">
          {!staff ? (
            <div className="card mx-auto max-w-md p-7 text-center">
              <p className="font-display text-2xl font-extrabold">Nothing here</p>
              <p className="mt-2 text-sm text-muted">
                This dashboard is for the KleeLab team. Clients follow their projects on the KleeLab site.
              </p>
              <button type="button" onClick={signOut} className="mt-5 text-sm font-semibold text-cobalt">
                Sign out
              </button>
            </div>
          ) : (
            children
          )}
        </main>
        {staff && searching && <CommandPalette onClose={() => setSearching(false)} />}
      </div>
    </UserContext.Provider>
  );
}
