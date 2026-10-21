'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { apiService } from '@/services/api';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <AuthShell tag="link problem" title="This link is incomplete" intro="Open the link from your email exactly as it was sent, or ask for a new one.">
        <Link href="/forgot-password" className="mt-6 inline-block text-sm font-medium text-cobalt">
          Request a new link →
        </Link>
      </AuthShell>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await apiService.resetPassword(token, password);
      if (email.trim()) {
        await apiService.login(email.trim(), password);
        router.replace('/');
      } else {
        router.replace('/login');
      }
    } catch (reason) {
      setBusy(false);
      setError(
        reason instanceof Error && /token|expired|signature/i.test(reason.message)
          ? 'This link has expired or was already replaced. Ask for a new one below.'
          : reason instanceof Error
            ? reason.message
            : 'Something went wrong. Please try again.',
      );
    }
  }

  return (
    <AuthShell tag="set password" title="Set your password" intro="Choose a password for the KleeLab team dashboard. You will use it with your email address to sign in.">
      <form className="mt-7 grid gap-4" onSubmit={submit} noValidate>
        <div>
          <label htmlFor="email" className="label">Your email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className="field" />
          <p className="mt-1.5 text-xs text-muted">So we can sign you straight in afterwards.</p>
        </div>
        <div>
          <label htmlFor="password" className="label">New password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="field" />
        </div>
        <div>
          <label htmlFor="confirm" className="label">Type it again</label>
          <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className="field" />
        </div>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {busy ? 'Saving…' : 'Save and continue'}
        </Button>
      </form>
      <p className="mt-6 border-t border-line pt-5 text-sm text-muted">
        Link not working?{' '}
        <Link href="/forgot-password" className="font-medium text-cobalt">
          Get a new one
        </Link>
      </p>
    </AuthShell>
  );
}
