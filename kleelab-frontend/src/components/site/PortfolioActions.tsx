'use client';

import { useEffect, useState } from 'react';
import { ArrowTopRightOnSquareIcon, CheckIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import { Button, buttonClass } from '@/components/ui/Button';

/** Counts one view per visitor session. Previews from the team are not counted. */
export function PortfolioView({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `kl-portfolio-view:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage blocked: count it anyway.
    }
    apiService.portfolioEvent(slug, 'view');
  }, [slug]);
  return null;
}

/** Opens the demo in a new tab and counts the click. */
export function DemoButton({ slug, url, count }: { slug: string; url: string; count: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      onClick={() => count && apiService.portfolioEvent(slug, 'demo')}
      className={buttonClass('sun', 'lg')}
    >
      Open live demo <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden />
    </a>
  );
}

/** A short enquiry tied to this item, so the team knows which site it is about. */
export function PortfolioEnquiry({ slug, title, forSale }: { slug: string; title: string; forSale: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  // Honeypot: people never see it, form-filling bots usually fill it in.
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return setError('Add an email address so we can reply.');
    if (message.trim().length < 10) return setError('Tell us a little about your business and what you would change.');
    setState('sending');
    setError(null);
    try {
      await apiService.submitLead({
        email: email.trim(),
        name: name.trim() || null,
        project_type: forSale ? `Ready-made site: ${title}`.slice(0, 255) : `Something like: ${title}`.slice(0, 255),
        message: message.trim(),
        portfolio_slug: slug,
        website,
      });
      setState('sent');
    } catch (reason) {
      setState('idle');
      setError(reason instanceof Error ? reason.message : 'That did not send. Please try again.');
    }
  }

  if (state === 'sent') {
    return (
      <div className="card relative p-7 shadow-block">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-sun">
          <CheckIcon className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight">Thanks, we have it.</h3>
        <p className="mt-2 leading-relaxed text-muted">
          We will reply within one working day{forSale ? ' with what we would change and an exact price' : ''}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card relative grid gap-4 p-6 shadow-block sm:p-7" noValidate>
      <div className="dim">enquiry</div>
      <h3 className="font-display text-2xl font-extrabold tracking-tight">
        {forSale ? 'I want this site' : 'I want something like this'}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-name" className="label">Your name</label>
          <input id="p-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="p-email" className="label">Email *</label>
          <input id="p-email" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
      </div>
      <div>
        <label htmlFor="p-message" className="label">About your business *</label>
        <textarea
          id="p-message"
          rows={4}
          className="field resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={forSale ? 'What is your business called, and what would you like changed?' : 'What do you do, and what would you want on your site?'}
        />
      </div>
      <div className="hidden" aria-hidden>
        <label htmlFor="p-website">Website</label>
        <input id="p-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send enquiry'}
      </Button>
      <p className="font-mono text-[11px] uppercase tracking-label text-muted">Reply within one working day</p>
    </form>
  );
}
