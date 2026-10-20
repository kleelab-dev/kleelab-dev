'use client';

import { useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { budgets, projectTypes } from '@/content/site';
import { apiService } from '@/services/api';
import { Button } from '@/components/ui/Button';

type Budget = (typeof budgets)[number]['value'] | 'own';

/** Keep digits only and show them with commas: 2500000 -> 2,500,000. */
function formatNaira(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
  return digits ? Number(digits).toLocaleString('en-NG') : '';
}

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [projectType, setProjectType] = useState<string>(projectTypes[0]);
  const [otherType, setOtherType] = useState('');
  const [budget, setBudget] = useState<Budget>('unsure');
  const [ownBudget, setOwnBudget] = useState('');
  const [message, setMessage] = useState('');
  // Honeypot: people never see it, form-filling bots usually fill it in.
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return setError('Add an email address so we can reply.');
    if (message.trim().length < 10) return setError('Tell us a little more about the project (a sentence or two is plenty).');
    const isOther = projectType === 'Something else';
    if (isOther && !otherType.trim()) return setError('Tell us in a few words what you need.');
    const ownDigits = ownBudget.replace(/\D/g, '');
    if (budget === 'own' && !ownDigits) return setError('Type your budget in naira, or pick one of the ranges.');
    setState('sending');
    setError(null);
    try {
      await apiService.submitLead({
        email: email.trim(),
        name: name.trim() || null,
        company: company.trim() || null,
        project_type: isOther ? `Something else: ${otherType.trim()}`.slice(0, 255) : projectType,
        budget: budget === 'own' ? `ngn_${ownDigits}` : budget,
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
          Someone from the team will reply within one working day to set up a short first call. No sales script,
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
        {projectType === 'Something else' && (
          <div className="mt-3">
            <label htmlFor="c-other" className="sr-only">What do you need?</label>
            <input
              id="c-other"
              className="field"
              autoFocus
              maxLength={200}
              placeholder="e.g. a mobile app, a booking system, fixing our current site"
              value={otherType}
              onChange={(e) => setOtherType(e.target.value)}
            />
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="label">Rough budget (naira)</legend>
        <p className="-mt-1 mb-3 text-sm text-muted">
          Only a guide, so we can suggest what fits. You get an exact price in writing after the first call.
        </p>
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
          <button
            type="button"
            aria-pressed={budget === 'own'}
            onClick={() => setBudget('own')}
            className={
              budget === 'own'
                ? 'rounded-full border-[1.5px] border-ink bg-sun px-3.5 py-1.5 text-sm'
                : 'rounded-full border-[1.5px] border-dashed border-cobalt bg-cobalt-soft px-3.5 py-1.5 text-sm text-cobalt hover:border-solid'
            }
          >
            + Type my own budget
          </button>
        </div>
        {budget === 'own' && (
          <div className="mt-3 max-w-xs">
            <label htmlFor="c-budget" className="sr-only">Your budget in naira</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-ink">₦</span>
              <input
                id="c-budget"
                className="field pl-9"
                inputMode="numeric"
                autoFocus
                placeholder="e.g. 750,000"
                value={ownBudget}
                onChange={(e) => setOwnBudget(formatNaira(e.target.value))}
              />
            </div>
          </div>
        )}
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
