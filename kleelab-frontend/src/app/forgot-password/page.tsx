'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { AuthShell, FormError } from '@/components/auth/AuthShell';
import { apiService } from '@/services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return setError('Enter the email address you sign in with.');
    setState('sending');
    setError(null);
    try {
      await apiService.requestPasswordReset(email.trim());
      setState('sent');
    } catch (reason) {
      setState('idle');
      setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.');
    }
  }

  if (state === 'sent') {
    return (
      <AuthShell tag="check your inbox" title="Link on its way" intro="If that address has an account, a reset link is in your inbox. It works for 15 minutes.">
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-cobalt">
          ← Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell tag="reset password" title="Forgot your password?" intro="Enter your email and we will send you a link to set a new one.">
      <form className="mt-7 grid gap-4" onSubmit={submit} noValidate>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="field" />
        </div>
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" disabled={state === 'sending'} className="w-full">
          {state === 'sending' ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthShell>
  );
}
