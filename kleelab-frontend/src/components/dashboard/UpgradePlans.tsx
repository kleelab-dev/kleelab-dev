'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import { PlanCard } from './PlanCard';
import type { Account } from '@/types/api';

/**
 * Plans, and the route to a bigger one.
 *
 * There is no checkout here, and the copy says so. Payments were deferred
 * (decision D6): a plan change is a manual change to `users.plan`. An upgrade
 * button that leads to a card form we cannot charge would be a worse experience
 * than an honest "tell us what you need" — a customer who has given us card
 * details and received nothing is a support incident, not a conversion.
 *
 * When a payment provider does land, this page becomes the checkout and the
 * enquiry form stays for Enterprise, which will never be self-serve.
 */

const TIERS = [
  {
    key: 'free',
    label: 'Free',
    price: '£0',
    cadence: 'forever',
    summary: 'Build a site with the AI builder and publish it on a kleelab.com address.',
    features: [
      '1 site, up to 5 pages',
      '3 AI builds per month',
      'Ask the assistant for changes, in your own words',
      'Publish on a kleelab.com address',
    ],
    cta: 'included',
  },
  {
    key: 'pro',
    label: 'Pro',
    price: '£19',
    cadence: 'per month',
    summary: 'A custom domain, a shop, and enough AI allowance to keep building.',
    features: [
      '5 sites, up to 25 pages each',
      '100 AI builds per month',
      'Your own domain, with DNS we walk you through',
      'Shop with products, orders and stock',
    ],
    cta: 'enquire',
  },
  {
    key: 'enterprise',
    label: 'Enterprise',
    price: 'Bespoke',
    cadence: '',
    summary:
      'Built with you, by us — including migrations, integrations and anything the builder cannot express. Hosted wherever you need it.',
    features: [
      'Designed and built by the studio',
      'Migrations from an existing site',
      'Integrations, SSO and bespoke components',
      'Hosted with us or handed over to your team',
    ],
    cta: 'enquire',
  },
] as const;

type Enquiry = {
  tier: 'pro' | 'enterprise';
  label: string;
} | null;

export function UpgradePlans() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [enquiry, setEnquiry] = useState<Enquiry>(null);

  useEffect(() => {
    let active = true;
    apiService
      .getAccount()
      .then((data) => {
        if (active) setAccount(data);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-10">
      {account && <PlanCard account={account} />}
      {loadFailed && (
        <p className="rounded-xl border border-line-strong bg-paper px-4 py-3 text-sm text-muted">
          We could not load your current plan. The plans below are still accurate.
        </p>
      )}

      <section aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="font-serif text-2xl">
          Plans
        </h2>
        <p className="mt-2 max-w-measure text-sm leading-6 text-muted">
          Every plan builds with the same editor and the same renderer. What changes is how much
          you can build, and whether it lives on your own domain.
        </p>

        <ul className="mt-6 grid gap-4 lg:grid-cols-3">
          {TIERS.map((tier) => {
            const current = account?.plan === tier.key;
            // The Pro tier is not purchasable yet, so its button opens the same
            // conversation Enterprise does rather than pretending otherwise.
            const isPro = tier.key === 'pro';

            return (
              <li
                key={tier.key}
                aria-current={current ? 'true' : undefined}
                className={`flex flex-col rounded-xl border bg-paper px-5 py-5 ${
                  current ? 'border-ink' : 'border-line'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-serif text-xl">{tier.label}</h3>
                  {current && (
                    <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-muted">
                      Current
                    </span>
                  )}
                </div>

                <p className="mt-3">
                  <span className="font-serif text-2xl">{tier.price}</span>
                  {tier.cadence && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-muted">
                      {tier.cadence}
                    </span>
                  )}
                </p>

                <p className="mt-3 text-sm leading-6 text-muted">{tier.summary}</p>

                <ul className="mt-4 flex-1 space-y-2">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-sm leading-6">
                      <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  {current ? (
                    <p className="text-xs text-muted">This is the plan you are on.</p>
                  ) : tier.cta === 'enquire' ? (
                    <button
                      type="button"
                      onClick={() =>
                        setEnquiry({
                          tier: isPro ? 'pro' : 'enterprise',
                          label: tier.label,
                        })
                      }
                      className={`w-full rounded-lg px-4 py-2.5 text-xs font-bold ${
                        isPro
                          ? 'bg-ink text-paper hover:bg-ink-soft'
                          : 'border border-line-strong hover:border-ink'
                      }`}
                    >
                      {isPro ? 'Ask about Pro' : 'Start a conversation'}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-label text-muted">
          Pro is being rolled out — we set it up with you while checkout is built.
        </p>
      </section>

      {enquiry && (
        <EnquiryForm
          tier={enquiry.tier}
          label={enquiry.label}
          account={account}
          onClose={() => setEnquiry(null)}
        />
      )}
    </div>
  );
}

type SubmitState = 'idle' | 'sending' | 'sent' | 'error';

function EnquiryForm({
  tier,
  label,
  account,
  onClose,
}: {
  tier: 'pro' | 'enterprise';
  label: string;
  account: Account | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The form appears below the fold of whatever the reader was looking at, so
  // without moving focus the click looks like it did nothing.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setState('sending');
    setError(null);

    try {
      await apiService.submitLead({
        email: String(data.get('email') ?? ''),
        name: String(data.get('name') ?? '') || null,
        company: String(data.get('company') ?? '') || null,
        interest: tier,
        budget: (data.get('budget') as 'under_5k' | null) ?? undefined,
        project_type: `${label} plan enquiry`,
        message: String(data.get('message') ?? ''),
      });
      form.reset();
      setState('sent');
    } catch (reason) {
      setState('error');
      setError(
        reason instanceof Error
          ? reason.message
          : 'That did not send. Please try again, or email us directly.',
      );
    }
  }

  if (state === 'sent') {
    return (
      <section className="rounded-xl border border-line-strong bg-paper px-5 py-6">
        <h2 className="font-serif text-xl">Thank you — that reached us.</h2>
        <p className="mt-2 max-w-measure text-sm leading-6 text-muted">
          We read these ourselves and reply to the address you gave. Nothing has changed on your
          account yet: if you asked about {label}, we will confirm the details before anything is
          switched on.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-lg border border-line-strong px-3 py-2 text-xs font-bold hover:border-ink"
        >
          Close
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="enquiry-heading" className="rounded-xl border border-ink bg-paper px-5 py-6">
      <h2 id="enquiry-heading" ref={headingRef} tabIndex={-1} className="font-serif text-xl outline-none">
        About a {label} plan
      </h2>
      <p className="mt-2 max-w-measure text-sm leading-6 text-muted">
        A couple of details help us answer properly the first time. We reply to your email address
        — there is no charge and nothing is switched on by submitting this.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <label htmlFor="enquiry-name" className="block text-sm font-medium">
            Name
          </label>
          <input
            id="enquiry-name"
            name="name"
            defaultValue={account?.full_name ?? ''}
            autoComplete="name"
            className="mt-1.5 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-1">
          <label htmlFor="enquiry-email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="enquiry-email"
            name="email"
            type="email"
            required
            defaultValue={account?.email ?? ''}
            autoComplete="email"
            className="mt-1.5 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-1">
          <label htmlFor="enquiry-company" className="block text-sm font-medium">
            Company <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="enquiry-company"
            name="company"
            autoComplete="organization"
            className="mt-1.5 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-1">
          <label htmlFor="enquiry-budget" className="block text-sm font-medium">
            Budget <span className="font-normal text-muted">(optional)</span>
          </label>
          <select
            id="enquiry-budget"
            name="budget"
            defaultValue="unsure"
            className="mt-1.5 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm"
          >
            <option value="unsure">Not sure yet</option>
            <option value="under_5k">Under £5,000</option>
            <option value="5k_15k">£5,000 – £15,000</option>
            <option value="15k_50k">£15,000 – £50,000</option>
            <option value="over_50k">Over £50,000</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="enquiry-message" className="block text-sm font-medium">
            What do you need?
          </label>
          <textarea
            id="enquiry-message"
            name="message"
            required
            minLength={10}
            rows={5}
            placeholder="Tell us about the site, what it needs to do, and when you need it."
            className="mt-1.5 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm"
          />
        </div>

        {state === 'error' && error && (
          <p
            role="alert"
            tabIndex={-1}
            className="flex items-start gap-2 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm sm:col-span-2"
          >
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={state === 'sending'}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-xs font-bold text-paper hover:bg-ink-soft disabled:opacity-60"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {state === 'sending' ? 'Sending…' : 'Send enquiry'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line-strong px-3 py-2 text-xs font-bold hover:border-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
