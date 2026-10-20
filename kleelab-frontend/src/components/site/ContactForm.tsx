'use client';

import { useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { budgets, projectTypes } from '@/content/site';
import { apiService } from '@/services/api';
import { Button } from '@/components/ui/Button';

type Budget = (typeof budgets)[number]['value'];

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [projectType, setProjectType] = useState<string>(projectTypes[0]);
  const [budget, setBudget] = useState<Budget>('unsure');
  const [message, setMessage] = useState('');
  // Honeypot: people never see it, form-filling bots usually fill it in.
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return setError('Add an email address so we can reply.');
    if (message.trim().length < 10) return setError('Tell us a little more about the project (a sentence or two is plenty).');
    setState('sending');
    setError(null);
    try {
      await apiService.submitLead({
        email: email.trim(),
        name: name.trim() || null,
        company: company.trim() || null,
        project_type: projectType,
        budget,
        message: message.trim(),
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
      <div className="card relative p-8 shadow-block">
        <span className="stamp absolute right-5 top-5">Received</span>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-sun">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-5 font-display text-3xl font-extrabold tracking-tight">Thanks, we have it.</h2>
        <p className="mt-3 max-w-md leading-relaxed text-muted">
          Someone from the team will reply within one working day to set up a short discovery call. No sales script,
          just questions about what you need.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card relative grid gap-5 p-6 shadow-block sm:p-8" noValidate>
      <div className="dim">enquiry form</div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className="label">Your name</label>
          <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="c-email" className="label">Email *</label>
          <input id="c-email" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
      </div>
      <div>
        <label htmlFor="c-company" className="label">Organisation</label>
        <input id="c-company" className="field" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
      </div>
      <fieldset>
        <legend className="label">What do you need?</legend>
        <div className="flex flex-wrap gap-2">
          {projectTypes.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={projectType === type}
              onClick={() => setProjectType(type)}
              className={
                projectType === type
                  ? 'rounded-full border-[1.5px] border-ink bg-ink px-3.5 py-1.5 text-sm text-paper'
                  : 'rounded-full border-[1.5px] border-line bg-white px-3.5 py-1.5 text-sm hover:border-ink'
              }
            >
              {type}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Rough budget</legend>
        <div className="flex flex-wrap gap-2">
          {budgets.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={budget === option.value}
              onClick={() => setBudget(option.value)}
              className={
                budget === option.value
                  ? 'rounded-full border-[1.5px] border-ink bg-sun px-3.5 py-1.5 text-sm'
                  : 'rounded-full border-[1.5px] border-line bg-white px-3.5 py-1.5 text-sm hover:border-ink'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="c-message" className="label">Tell us about it *</label>
        <textarea
          id="c-message"
          rows={5}
          className="field resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What are you hoping to build, who is it for, and is there a date you are working towards?"
        />
      </div>
      <div className="hidden" aria-hidden>
        <label htmlFor="c-website">Website</label>
        <input id="c-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send enquiry'}
        </Button>
        <p className="font-mono text-[11px] uppercase tracking-label text-muted">Reply within one working day</p>
      </div>
    </form>
  );
}
