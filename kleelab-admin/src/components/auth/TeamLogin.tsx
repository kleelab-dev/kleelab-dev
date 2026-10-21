'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { ApiError, apiService } from '@/services/api';

/** Team sign-in. Same accounts as the public site; only staff get past AppShell. */
export function TeamLogin({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the password is right and the account has two-step on.
  const [challenge, setChallenge] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiService.login(email.trim(), password);
      if (result) {
        setChallenge(result.challenge);
        setBusy(false);
        return;
      }
      // `replace`, so the back button does not return to a finished sign-in form.
      router.replace(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign you in.');
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <CodeStep
        challenge={challenge}
        onDone={() => router.replace(next)}
        onExpired={(message) => {
          setChallenge(null);
          setPassword('');
          setError(message);
        }}
      />
    );
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
    </AuthShell>
  );
}

function CodeStep({ challenge, onDone, onExpired }: { challenge: string; onDone: () => void; onExpired: (message: string) => void }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim();
    if (!value) return setError(recovery ? 'Type one of your recovery codes.' : 'Type the 6-digit code from your app.');
    setBusy(true);
    setError(null);
    try {
      await apiService.loginWithCode(challenge, value);
      onDone();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to sign you in.';
      // The challenge lasts five minutes; after that the password is needed again.
      if (reason instanceof ApiError && reason.status === 401 && /expired/i.test(message)) return onExpired(message);
      setError(message);
      setCode('');
      setBusy(false);
    }
  }

  return (
    <AuthShell
      tag="two-step"
      title="One more step"
      intro={recovery ? 'Type one of the recovery codes you saved when you set up two-step sign-in. Each works once.' : 'Open your authenticator app and type the 6-digit code for KleeLab.'}
    >
      <form className="mt-7 grid gap-4" onSubmit={submit} noValidate>
        <div>
          <label htmlFor="code" className="label">{recovery ? 'Recovery code' : 'Code'}</label>
          <input
            key={recovery ? 'recovery' : 'app'}
            id="code"
            value={code}
            onChange={(e) => setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code"
            inputMode={recovery ? 'text' : 'numeric'}
            autoCapitalize="off"
            spellCheck={false}
            placeholder={recovery ? 'xxxx-xxxx' : '123456'}
            className="field text-center font-mono text-xl tracking-[0.3em]"
            autoFocus
          />
        </div>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {busy ? 'Checking…' : 'Sign in'}
        </Button>
        <button
          type="button"
          onClick={() => {
            setRecovery(!recovery);
            setCode('');
            setError(null);
          }}
          className="text-sm text-cobalt"
        >
          {recovery ? 'Use a code from the app instead' : 'Lost your phone? Use a recovery code'}
        </button>
      </form>
    </AuthShell>
  );
}
