'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';

type State = 'working' | 'verified' | 'failed';

/**
 * Landing page for the emailed verification link.
 *
 * The backend has always been able to verify a token, but there was nowhere to
 * send the user: the email contained a bare token with no page to enter it into,
 * so the gate could never actually be passed.
 */
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

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-ink text-paper">
          <SparklesIcon className="h-5 w-5" />
        </span>

        {state === 'working' && (
          <>
            <p className="mt-5 font-serif text-2xl">Confirming your email…</p>
            <p className="mt-2 text-sm text-muted">One moment.</p>
          </>
        )}

        {state === 'verified' && (
          <>
            <CheckCircleIcon className="mx-auto mt-5 h-10 w-10 text-success" />
            <p className="mt-4 font-serif text-2xl">Email confirmed</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Your account is verified. You can publish your sites now.
            </p>
            <Link
              href="/builder/dashboard"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-white hover:bg-accent-dark"
            >
              Go to your sites <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </>
        )}

        {state === 'failed' && (
          <>
            <ExclamationTriangleIcon className="mx-auto mt-5 h-10 w-10 text-accent" />
            <p className="mt-4 font-serif text-2xl">This link did not work</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {message || 'The link may have expired.'}
            </p>
            <p className="mt-4 text-sm leading-6 text-muted">
              Sign in and request a new link from your dashboard.
            </p>
            <Link
              href="/builder/dashboard"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper hover:bg-ink-soft"
            >
              Back to KleeLab <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
