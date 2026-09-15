'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/marketing/Button';
import { KleeLabLogo } from '@/components/marketing/KleeLabLogo';
import { apiService } from '@/services/api';

/**
 * Sign in, or create an account.
 *
 * This replaces an auth form that only existed inside the new-site wizard, which
 * meant the single way to sign in was to start creating a site you did not want.
 * It is one component in two modes because the fields, the validation, the error
 * handling and the post-sign-in destination are identical — only the extra name
 * field and the wording differ.
 */

const FIELD =
  'w-full rounded-lg border border-line-strong bg-white px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-ink';

export function AuthPanel({
  mode,
  next,
}: {
  mode: 'login' | 'register';
  /** Where to land after a successful sign-in. Already validated as same-site. */
  next: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';
  const otherHref = `/${isRegister ? 'login' : 'register'}?next=${encodeURIComponent(next)}`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        // Registering does not establish a session — it returns the account and
        // sends a verification email — so signing in is a separate step.
        await apiService.register({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        });
      }
      await apiService.login(email.trim(), password);
      // `replace`, not `push`. Leaving a completed sign-in form in the history
      // means the back button returns to it, and resubmitting rotates the
      // session again for no reason.
      router.replace(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign you in.');
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-12 text-ink">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-block text-ink no-underline" aria-label="KleeLab home">
          <KleeLabLogo className="h-7 w-auto" />
        </Link>

        <section className="mt-8 rounded-2xl border border-line bg-paper p-7">
          <h1 className="font-serif text-3xl leading-tight">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            {isRegister
              ? 'Your sites live in your account, so you can come back and edit them any time.'
              : 'Sign in to pick up where you left off.'}
          </p>

          <form className="mt-7 grid gap-3" onSubmit={submit} noValidate>
            {isRegister && (
              <div>
                <label htmlFor="full-name" className="mb-1.5 block text-xs font-bold">
                  Name
                </label>
                <input
                  id="full-name"
                  name="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  className={FIELD}
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-bold">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className={FIELD}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-bold">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                className={FIELD}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm"
              >
                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <Button type="submit" size="lg" disabled={busy} className="mt-2 w-full">
              {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          {isRegister && (
            <p className="mt-4 text-xs leading-5 text-muted">
              We will email you a link to confirm your address. You can build straight away; the
              link is only needed before you publish.
            </p>
          )}

          <p className="mt-6 border-t border-line pt-5 text-sm text-muted">
            {isRegister ? 'Already have an account?' : 'No account yet?'}{' '}
            <Link href={otherHref} className="font-medium text-ink underline underline-offset-2">
              {isRegister ? 'Sign in' : 'Create one'}
            </Link>
          </p>
        </section>

        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/" className="underline underline-offset-2 hover:text-ink">
            Back to KleeLab
          </Link>
        </p>
      </div>
    </main>
  );
}
