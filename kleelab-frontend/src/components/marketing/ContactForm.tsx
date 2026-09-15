'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/marketing/Button';
import { projectTypes, studio } from '@/content/site';

type Status = 'idle' | 'sending' | 'sent' | 'error';

// No `focus:outline-none` here. It was overriding the site's own focus ring and
// leaving keyboard users with nothing but a border shifting from near-white to
// black - the one change you cannot see on a low-contrast screen. The global
// ring is the focus indicator, everywhere.
const FIELD =
  'mt-2 w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-muted focus:border-ink';

const LABEL = 'block text-sm font-medium text-ink';

/** Only two fields are actually needed, so the rest say so rather than leaving
    the reader to work it out from an unexplained asterisk. */
const OPTIONAL = 'font-normal text-muted';

export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // A failed submit has to be noticed. The message sits below the fields, so
  // without moving focus the page looks like nothing happened at all.
  useEffect(() => {
    if (status === 'error') errorRef.current?.focus();
  }, [status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus('sending');
    setError(null);

    try {
      const response = await fetch('/api/agency/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name') || null,
          email: data.get('email'),
          project_type: data.get('project_type') || null,
          message: data.get('message'),
          website: data.get('website') || null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        // FastAPI returns a list of issues for validation failures, which is not
        // useful to show verbatim.
        const detail = payload?.detail;
        throw new Error(
          typeof detail === 'string'
            ? detail
            : 'That did not send. Check the email address and try again.',
        );
      }

      form.reset();
      setStatus('sent');
    } catch (reason) {
      setStatus('error');
      setError(
        reason instanceof Error
          ? reason.message
          : 'That did not send. Please try again, or email us directly.',
      );
    }
  }

  if (status === 'sent') {
    return (
      <div
        role="status"
        className="rounded-2xl border border-success-line bg-success-surface p-8"
      >
        <h2 className="font-serif text-2xl">Message received</h2>
        <p className="mt-3 max-w-measure text-sm leading-6 text-muted">
          Thanks — we read everything ourselves. You will get a reply within two working days,
          usually sooner.
        </p>
        <p className="mt-4 text-sm leading-6 text-muted">
          If it is urgent, email{' '}
          <a href={`mailto:${studio.email}`} className="text-accent underline underline-offset-2">
            {studio.email}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={LABEL}>
            Your name <span className={OPTIONAL}>(optional)</span>
          </label>
          <input id="name" name="name" type="text" autoComplete="name" className={FIELD} />
        </div>

        <div>
          <label htmlFor="email" className={LABEL}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <label htmlFor="project_type" className={LABEL}>
          What do you need? <span className={OPTIONAL}>(optional)</span>
        </label>
        <select id="project_type" name="project_type" defaultValue="" className={FIELD}>
          <option value="">Not sure yet</option>
          {projectTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className={LABEL}>
          What are you working on?
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={10}
          rows={5}
          placeholder="A sentence or two is plenty."
          aria-describedby="message-hint"
          className={FIELD}
        />
        {/* The prompt used to live in the placeholder, so it vanished the moment
            someone started typing - exactly when they need it. */}
        <p id="message-hint" className="mt-1.5 text-xs leading-5 text-muted">
          What is the site for, and what is not working at the moment?
        </p>
      </div>

      {/* Honeypot: off-screen and unreachable by keyboard, so only a script fills it. */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {status === 'error' && error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <Button type="submit" size="lg" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send message'}
        </Button>
        <p className="font-mono text-xs text-muted">We reply within two working days.</p>
      </div>
    </form>
  );
}
