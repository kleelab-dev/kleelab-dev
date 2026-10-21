'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { apiService } from '@/services/api';

// Password resets are emailed with a link to the public site, so "Forgot it?"
// sends people there rather than duplicating the reset pages here.
const CLIENT_SITE = (process.env.NEXT_PUBLIC_CLIENT_SITE_URL || 'https://kleelab.com').replace(/\/$/, '');

/** Team sign-in. Same accounts as the public site; only staff get past AppShell. */
export function TeamLogin({ next }: { next: string }) {
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
    <AuthShell tag="team login" title="KleeLab team" intro="Sign in to run client projects and answer enquiries.">
      <form className="mt-7 grid gap-4" onSubmit={submit} noValidate>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="field" />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="label">Password</label>
            <a href={`${CLIENT_SITE}/forgot-password`} className="text-xs text-cobalt">
              Forgot it?
            </a>
          </div>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="field" />
        </div>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" disabled={busy} className="mt-1 w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}
