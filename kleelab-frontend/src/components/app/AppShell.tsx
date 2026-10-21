'use client';

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Logo } from '@/components/ui/Logo';
import { ApiError, apiService, hasSession } from '@/services/api';
import type { User } from '@/types/api';

type UserContextValue = { user: User; setUser: (user: User) => void };

const UserContext = createContext<UserContextValue | null>(null);

function useUserContext(): UserContextValue {
  const value = useContext(UserContext);
  if (!value) throw new Error('useCurrentUser must be used inside AppShell');
  return value;
}

/** The signed-in user. Only valid below an AppShell, which renders nothing until it is known. */
export function useCurrentUser(): User {
  return useUserContext().user;
}

/** Replace the signed-in user everywhere on the page, such as after a rename. */
export function useUpdateUser(): (user: User) => void {
  return useUserContext().setUser;
}

type State = { kind: 'loading' } | { kind: 'ready'; user: User } | { kind: 'failed'; message: string };

/**
 * Frame for every signed-in page: checks the session, sends strangers to the
 * login page with a way back. Team pages live in the separate admin app.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ kind: 'loading' });

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

  async function signOut() {
    await apiService.logout().catch(() => undefined);
    router.replace('/login');
  }

  if (state.kind === 'loading') {
    return (
      <main className="bg-graph grid min-h-screen place-items-center">
        <p role="status" className="font-mono text-[11px] uppercase tracking-label text-muted">
          <span className="kl-dot mr-2 inline-block h-2 w-2 rounded-full bg-cobalt" />
          Loading your dashboard
        </p>
      </main>
    );
  }

  if (state.kind === 'failed') {
    return (
      <main className="bg-graph grid min-h-screen place-items-center px-4 sm:px-5">
        <div role="alert" className="card max-w-md p-7 text-center">
          <p className="font-display text-2xl font-extrabold">We could not load your account</p>
          <p className="mt-2 text-sm text-muted">{state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-cobalt px-5 text-sm font-semibold text-white hover:bg-cobalt-dark"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const { user } = state;
  const setUser = (next: User) => setState({ kind: 'ready', user: next });
  const onProjects = pathname === '/dashboard' || pathname.startsWith('/dashboard/projects');
  const onAccount = pathname.startsWith('/account');

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <div className="bg-graph min-h-screen text-ink">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b-[1.5px] border-ink bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-content items-center gap-3 px-4 py-2.5 sm:gap-6 sm:px-5">
            <Link href="/dashboard" className="shrink-0 no-underline" aria-label="Dashboard home">
              <Logo />
            </Link>
            <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Dashboard">
              <NavLink href="/dashboard" current={onProjects}>
                <span className="sm:hidden">Projects</span>
                <span className="hidden sm:inline">Your projects</span>
              </NavLink>
              <NavLink href="/account" current={onAccount} className="hidden sm:inline-flex">
                Your account
              </NavLink>
            </nav>
            <AccountMenu user={user} onSignOut={signOut} />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-content px-4 py-8 sm:px-5 sm:py-12">
          {children}
        </main>
      </div>
    </UserContext.Provider>
  );
}

function NavLink({ href, current, className, children }: { href: string; current: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={clsx(
        'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-sm font-medium no-underline',
        current ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5',
        className,
      )}
    >
      {children}
    </Link>
  );
}

function initials(user: User): string {
  const source = user.full_name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

/** Who is signed in, the account page and signing out, behind one button that fits on a phone. */
function AccountMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-ink no-underline hover:bg-ink/5';

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="grid h-11 w-11 place-items-center rounded-full border-[1.5px] border-ink bg-white font-mono text-xs font-semibold hover:bg-sun-soft"
      >
        <span aria-hidden>{initials(user)}</span>
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div id={menuId} className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border-[1.5px] border-ink bg-paper p-2 shadow-block">
          <div className="border-b border-line px-3 pb-3 pt-2">
            {user.full_name && <p className="truncate text-sm font-semibold">{user.full_name}</p>}
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="grid gap-0.5 pt-2">
            <Link href="/dashboard" className={item} onClick={() => setOpen(false)}>
              Your projects
            </Link>
            <Link href="/account" className={item} onClick={() => setOpen(false)}>
              Your account
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className={item}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
