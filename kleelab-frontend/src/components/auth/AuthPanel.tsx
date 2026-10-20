'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { apiService } from '@/services/api';

/**
 * Client sign-in.
 *
 * There is no public sign-up: client accounts are created by the team when a
 * project starts, and the client sets a password from the invite email.
 */
export function AuthPanel({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiService.login(email.trim(), password);
      // `replace`, so the back button does not return to a finished sign-in form.
      router.replace(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign you in.');
      setBusy(false);
    }
  }

  return (
    <AuthShell tag="client login" title="Welcome back" intro="Sign in to follow your project, answer questions and sign off work.">
      <form className="mt-7 grid gap-4" onSubmit={submit} noValidate>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="field" />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="label">Password</label>
            <Link href="/forgot-password" className="text-xs text-cobalt">
              Forgot it?
            </Link>
          </div>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="field" />
        </div>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" disabled={busy} className="mt-1 w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-6 border-t border-line pt-5 text-sm leading-6 text-muted">
        No account yet? Accounts are set up when your project starts.{' '}
        <Link href="/contact" className="font-medium text-cobalt">
          Start a project
        </Link>
      </p>
    </AuthShell>
  );
}
