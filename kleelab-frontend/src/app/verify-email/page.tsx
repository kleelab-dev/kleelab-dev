'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { apiService } from '@/services/api';

type State = 'working' | 'verified' | 'failed';

/** Landing page for an emailed verification link. */
export default function VerifyEmailPage() {
  const [state, setState] = useState<State>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const token = new URLSearchParams(window.location.search).get('token');

    if (!token) {
      // Deferred rather than set directly: calling setState in an effect body
      // triggers cascading renders (react-hooks/set-state-in-effect).
      Promise.resolve().then(() => {
        if (!active) return;
        setState('failed');
        setMessage('This link is missing its token. Open the link from your email exactly as sent.');
      });
      return () => {
        active = false;
      };
    }

    apiService
      .verifyEmail(token)
      .then(() => {
        if (active) setState('verified');
      })
      .catch((reason: Error) => {
        if (!active) return;
        setState('failed');
        setMessage(reason.message);
      });

    return () => {
      active = false;
    };
  }, []);

  if (state === 'working') {
    return <AuthShell tag="verifying" title="Confirming your email…" intro="One moment." />;
  }

  if (state === 'verified') {
    return (
      <AuthShell tag="verified" title="Email confirmed" intro="Thanks. Your address is confirmed.">
        <Link href="/dashboard" className="mt-6 inline-block text-sm font-semibold text-cobalt">
          Go to your dashboard →
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell tag="link problem" title="This link did not work" intro={message || 'The link may have expired.'}>
      <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-cobalt">
        Sign in →
      </Link>
    </AuthShell>
  );
}
