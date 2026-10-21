'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Logo } from '@/components/ui/Logo';
import { ApiError, apiService, hasSession } from '@/services/api';
import type { User } from '@/types/api';

const UserContext = createContext<User | null>(null);

/** The signed-in user. Only valid below an AppShell, which renders nothing until it is known. */
export function useCurrentUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error('useCurrentUser must be used inside AppShell');
  return user;
}

type State = { kind: 'loading' } | { kind: 'ready'; user: User } | { kind: 'failed'; message: string };

/**
 * Frame for every team page: checks the session, sends strangers to the login
 * page with a way back, and turns away signed-in clients. The API refuses their
 * /api/admin calls anyway; this only spares them a page that cannot load.
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
  const staff = user.role === 'staff';
  // Clients have no pages here, so the nav is the team's only.
  const nav = [
    { href: '/', label: 'Projects' },
    { href: '/leads', label: 'Enquiries' },
  ];

  return (
    <UserContext.Provider value={user}>
      <div className="bg-graph min-h-screen text-ink">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b-[1.5px] border-ink bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-content items-center gap-6 px-5 py-3.5">
            <Link href="/" className="no-underline" aria-label="Team dashboard home">
              <Logo />
            </Link>
            <span className="stamp hidden -rotate-2 sm:inline-block">Team</span>
            <nav className="flex flex-1 items-center gap-1" aria-label="Dashboard">
              {nav.map((item) => {
                const current = item.href === '/'
                  ? pathname === '/' || pathname.startsWith('/projects')
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={clsx(
                      'rounded-full px-3 py-1.5 text-sm font-medium no-underline',
                      current ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <span className="hidden truncate text-xs text-muted md:inline">{user.email}</span>
            <button type="button" onClick={signOut} className="text-sm font-medium text-ink-soft hover:text-ink">
              Sign out
            </button>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-content px-5 py-10 sm:py-12">
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
      </div>
    </UserContext.Provider>
  );
}
