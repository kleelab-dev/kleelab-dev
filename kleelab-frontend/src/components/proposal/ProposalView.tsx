'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { CheckIcon } from '@heroicons/react/24/outline';
import { Logo } from '@/components/ui/Logo';
import { Button, buttonClass } from '@/components/ui/Button';
import { FormError } from '@/components/auth/AuthShell';
import { errorText, formatDate, formatMoney } from '@/components/project/format';
import { ApiError, apiService, hasSession } from '@/services/api';
import type { ProposalAccepted, PublicProposal } from '@/types/api';

/** A proposal from its email link: read it, then accept or decline it online. */
export function ProposalView({ token }: { token: string }) {
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<ProposalAccepted | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .getProposal(token)
      .then((value) => active && setProposal(value))
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 404) setMissing(true);
        else setLoadError(errorText(reason));
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);

  const reload = () => setAttempt((n) => n + 1);

  if (missing) {
    return (
      <Shell>
        <section className="card p-7 shadow-block sm:p-8">
          <div className="dim">link problem</div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">We cannot find this proposal</h1>
          <p className="mt-3 text-sm leading-6 text-muted">Open the link from your email exactly as it was sent. If it still does not work, reply to that email and we will send it again.</p>
        </section>
      </Shell>
    );
  }

  if (!proposal) {
    return (
      <Shell>
        {loadError ? (
          <div role="alert" className="flex flex-wrap items-center gap-4 rounded-xl bg-danger-soft p-4 text-sm text-danger">
            <span className="flex-1">{loadError}</span>
            <button type="button" onClick={() => { setLoadError(null); reload(); }} className="font-semibold underline underline-offset-2">Try again</button>
          </div>
        ) : (
          <div className="card animate-pulse p-8" role="status">
            <span className="sr-only">Loading your proposal…</span>
            <div className="h-4 w-1/4 rounded-full bg-line" />
            <div className="mt-4 h-8 w-3/4 rounded-full bg-line" />
            <div className="mt-6 h-3 w-full rounded-full bg-line/70" />
            <div className="mt-2 h-3 w-2/3 rounded-full bg-line/70" />
          </div>
        )}
      </Shell>
    );
  }

  if (accepted) return <AcceptedScreen result={accepted} />;

  const p = proposal;
  const scope = (p.scope ?? '').split('\n').map((line) => line.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
  const balance = p.total_cents - p.deposit_cents;
  // Sections are numbered as shown, so a missing one leaves no gap.
  let section = 0;
  const nextTag = () => String(++section).padStart(2, '0');

  return (
    <Shell wide>
      <StatusBanner proposal={p} />

      <article className="card overflow-hidden shadow-block">
        <header className="border-b-[1.5px] border-ink bg-paper px-6 py-8 sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-label text-muted">
            <span>Proposal {p.reference}</span>
            {p.valid_until && <span>Open until {formatDate(p.valid_until)}</span>}
          </div>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tightest sm:text-5xl">{p.title}</h1>
          <p className="mt-3 text-sm text-muted">
            {p.client_name ? <>For <strong className="text-ink">{p.client_name}</strong></> : 'For you'}
            {p.prepared_by && <> · prepared by {p.prepared_by} at KleeLab</>}
            {p.sent_at && <> · {formatDate(p.sent_at)}</>}
          </p>
        </header>

        <div className="grid gap-10 px-6 py-8 sm:px-10">
          {p.summary && (
            <Part tag={nextTag()} title="What you need">
              <p className="whitespace-pre-line text-base leading-7 text-ink-soft">{p.summary}</p>
            </Part>
          )}

          {scope.length > 0 && (
            <Part tag={nextTag()} title="What is included">
              <ul className="grid gap-2">
                {scope.map((line, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-6 text-ink-soft">
                    <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-cobalt" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Part>
          )}

          <Part tag={nextTag()} title="Price">
            <table className="w-full text-sm">
              <tbody>
                {p.items.map((item, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-3 pr-4 text-ink-soft">{item.description}</td>
                    <td className="whitespace-nowrap py-3 text-right font-mono">{formatMoney(item.amount_cents, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="pt-4 text-left font-display text-lg font-extrabold">Total</th>
                  <td className="whitespace-nowrap pt-4 text-right font-display text-2xl font-extrabold">{formatMoney(p.total_cents, p.currency)}</td>
                </tr>
              </tfoot>
            </table>
            {p.deposit_cents > 0 && balance > 0 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Money label={`Deposit (${p.deposit_percent}%) to start`} value={formatMoney(p.deposit_cents, p.currency)} strong />
                <Money label="The rest, at hand-over" value={formatMoney(balance, p.currency)} />
              </div>
            )}
          </Part>

          {p.stages.length > 0 && (
            <Part tag={nextTag()} title={p.duration_weeks ? `How it runs · about ${p.duration_weeks} ${p.duration_weeks === 1 ? 'week' : 'weeks'}` : 'How it runs'}>
              <ol className="grid gap-0">
                {p.stages.map((stage, i) => (
                  <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < p.stages.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-line" aria-hidden />}
                    <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-white font-mono text-xs">{i + 1}</span>
                    <div className="min-w-0 pt-0.5">
                      <p className="font-semibold">{stage.name}</p>
                      {stage.description && <p className="mt-0.5 text-sm leading-6 text-muted">{stage.description}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </Part>
          )}

          {p.terms && (
            <Part tag={nextTag()} title="Terms">
              <p className="whitespace-pre-line text-sm leading-6 text-muted">{p.terms}</p>
            </Part>
          )}
        </div>
      </article>

      {/* Keyed by version: a reloaded copy starts a clean form, without the old error. */}
      {p.status === 'sent' && <Answer key={p.revision} token={token} proposal={p} onAccepted={setAccepted} onChanged={setProposal} onStale={reload} />}
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="bg-graph min-h-screen px-4 py-10 text-ink sm:px-5 sm:py-12">
      <div className={clsx('mx-auto grid w-full gap-6', wide ? 'max-w-3xl' : 'max-w-md')}>
        <Link href="/" className="inline-block w-fit no-underline" aria-label="KleeLab home">
          <Logo className="text-2xl" />
        </Link>
        {children}
      </div>
    </main>
  );
}

function Part({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="font-mono text-[11px] uppercase tracking-label text-cobalt">{tag}</p>
      <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Money({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={clsx('rounded-xl border-[1.5px] p-4', strong ? 'border-ink bg-sun-soft' : 'border-line bg-paper')}>
      <p className="font-mono text-[10px] uppercase tracking-label text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-extrabold">{value}</p>
    </div>
  );
}

function StatusBanner({ proposal }: { proposal: PublicProposal }) {
  const banner = {
    accepted: { tone: 'bg-mint', text: `Accepted${proposal.accepted_name ? ` by ${proposal.accepted_name}` : ''}${proposal.accepted_at ? ` on ${formatDate(proposal.accepted_at)}` : ''}. Your project is on your KleeLab dashboard.` },
    declined: { tone: 'bg-line', text: `You declined this proposal${proposal.declined_at ? ` on ${formatDate(proposal.declined_at)}` : ''}. Changed your mind? Reply to our email and we will send a fresh one.` },
    withdrawn: { tone: 'bg-line', text: 'We withdrew this proposal, so it can no longer be accepted. Reply to our email if you would like a new one.' },
    expired: { tone: 'bg-sun-soft', text: `This proposal closed${proposal.valid_until ? ` on ${formatDate(proposal.valid_until)}` : ''}. Reply to our email and we will send you a fresh one.` },
    sent: null,
  }[proposal.status];
  if (!banner) return null;
  return (
    <div role="status" className={clsx('flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-ink p-4 text-sm', banner.tone)}>
      <span className="flex-1">{banner.text}</span>
      {proposal.status === 'accepted' && <Link href="/dashboard" className={buttonClass('secondary', 'sm')}>Open your dashboard</Link>}
    </div>
  );
}

function Answer({
  token,
  proposal,
  onAccepted,
  onChanged,
  onStale,
}: {
  token: string;
  proposal: PublicProposal;
  onAccepted: (result: ProposalAccepted) => void;
  onChanged: (proposal: PublicProposal) => void;
  onStale: () => void;
}) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  // Paying it all at once is offered whenever the deposit is less than the whole price.
  const rest = proposal.total_cents - proposal.deposit_cents;
  const canChoose = rest > 0 && proposal.total_cents > 0;
  const [payment, setPayment] = useState<'deposit' | 'full'>('deposit');
  const full = !canChoose || payment === 'full';
  const firstInvoice = full ? proposal.total_cents : proposal.deposit_cents;
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  function fail(reasonValue: unknown) {
    setError(errorText(reasonValue));
    // Edited, withdrawn or closed while the page was open: offer the latest copy.
    if (reasonValue instanceof ApiError && (reasonValue.status === 409 || reasonValue.status === 410)) setStale(true);
  }

  async function accept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) return setError('Type your full name to sign.');
    if (!agree) return setError('Tick the box to say you agree.');
    setBusy(true);
    setError(null);
    try {
      onAccepted(await apiService.acceptProposal(token, name.trim(), proposal.revision, full ? 'full' : 'deposit'));
    } catch (reasonValue) {
      fail(reasonValue);
      setBusy(false);
    }
  }

  async function decline(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChanged(await apiService.declineProposal(token, reason.trim(), proposal.revision));
    } catch (reasonValue) {
      fail(reasonValue);
      setBusy(false);
    }
  }

  return (
    <section className="card p-6 shadow-block sm:p-8" aria-labelledby="answer-title">
      <div className="dim">your answer</div>
      <h2 id="answer-title" className="font-display text-3xl font-extrabold tracking-tight">Happy to go ahead?</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Accepting sets up your project on your KleeLab dashboard
        {firstInvoice > 0 && <> and sends your first invoice, for <strong className="text-ink">{formatMoney(firstInvoice, proposal.currency)}</strong></>}.
        {firstInvoice > 0 ? ' We start once it is paid.' : ' Nothing is due until hand-over.'}
      </p>

      {error && (
        <div className="mt-5 grid gap-2">
          <FormError>{error}</FormError>
          {stale && (
            <button type="button" onClick={onStale} className="w-fit text-sm font-semibold text-cobalt">Load the latest version →</button>
          )}
        </div>
      )}

      {!declining ? (
        <form className="mt-6 grid gap-4" onSubmit={accept} noValidate>
          {canChoose && (
            <fieldset>
              <legend className="label">How would you like to pay?</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <PayOption
                  checked={payment === 'deposit'}
                  onChange={() => setPayment('deposit')}
                  title={proposal.deposit_cents > 0 ? `Deposit now (${proposal.deposit_percent}%)` : 'Pay at hand-over'}
                  detail={proposal.deposit_cents > 0
                    ? `${formatMoney(proposal.deposit_cents, proposal.currency)} now, ${formatMoney(rest, proposal.currency)} at hand-over`
                    : `${formatMoney(rest, proposal.currency)} when we hand it over`}
                />
                <PayOption
                  checked={payment === 'full'}
                  onChange={() => setPayment('full')}
                  title="Everything now"
                  detail={`${formatMoney(proposal.total_cents, proposal.currency)} now, nothing at hand-over`}
                />
              </div>
            </fieldset>
          )}
          <div>
            <label htmlFor="sign_name" className="label">Your full name</label>
            <input id="sign_name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" className="field font-display text-lg" placeholder={proposal.client_name ?? ''} />
            <p className="mt-1.5 text-xs text-muted">Typing your name counts as your signature.</p>
          </div>
          <label className="flex items-start gap-3 text-sm leading-6">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-cobalt" />
            <span>I accept this proposal ({proposal.reference}) for {formatMoney(proposal.total_cents, proposal.currency)}, including the terms above.</span>
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" variant="sun" size="lg" disabled={busy}>{busy ? 'Accepting…' : 'Accept proposal'}</Button>
            <button type="button" onClick={() => { setDeclining(true); setError(null); }} className="text-sm text-muted hover:text-ink">
              No thanks
            </button>
          </div>
        </form>
      ) : (
        <form className="mt-6 grid gap-4" onSubmit={decline}>
          <div>
            <label htmlFor="decline_reason" className="label">Anything we should know? (optional)</label>
            <textarea id="decline_reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className="field"
              placeholder="The price, the timing, something missing…" />
            <p className="mt-1.5 text-xs text-muted">It helps us send something that fits better.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" variant="secondary" disabled={busy}>{busy ? 'Sending…' : 'Decline proposal'}</Button>
            <button type="button" onClick={() => setDeclining(false)} className="text-sm text-muted hover:text-ink">Back</button>
          </div>
        </form>
      )}
    </section>
  );
}

function PayOption({ checked, onChange, title, detail }: { checked: boolean; onChange: () => void; title: string; detail: string }) {
  return (
    <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] p-4 text-sm transition-colors',
      checked ? 'border-ink bg-sun-soft' : 'border-line bg-paper hover:border-ink')}>
      <input type="radio" name="payment" checked={checked} onChange={onChange} className="mt-1 h-4 w-4 accent-cobalt" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-muted">{detail}</span>
      </span>
    </label>
  );
}

function AcceptedScreen({ result }: { result: ProposalAccepted }) {
  const signedIn = hasSession();
  const p = result.proposal;
  const full = p.payment_choice === 'full';
  const first = full ? p.total_cents : p.deposit_cents;
  const rest = full ? 0 : p.total_cents - p.deposit_cents;
  return (
    <Shell>
      <section className="card p-7 shadow-block sm:p-8">
        <div className="dim">accepted</div>
        <span className="mt-2 grid h-12 w-12 place-items-center rounded-full border-[1.5px] border-ink bg-mint" aria-hidden>
          <CheckIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">Thank you. We are on it.</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Your project is set up
          {first > 0 && <> and {full ? 'your invoice' : 'the deposit invoice'} for {formatMoney(first, p.currency)} is waiting on your dashboard</>}.
          {rest > 0 && <> The rest, {formatMoney(rest, p.currency)}, is billed when we hand the project over.</>}
        </p>
        {result.invited && result.invite_sent ? (
          <p className="mt-4 rounded-xl bg-sun-soft p-4 text-sm leading-6">
            Check <strong>{result.email}</strong>. We sent a link to choose your password and open your dashboard. It works for 7 days.
          </p>
        ) : result.invited ? (
          <div className="mt-4 rounded-xl bg-sun-soft p-4 text-sm leading-6">
            <p>We could not email you a sign-in link just now. Set a password for <strong>{result.email}</strong> and you can open your dashboard straight away.</p>
            <Link href="/forgot-password" className={buttonClass('primary', 'sm', 'mt-3')}>Set your password</Link>
          </div>
        ) : (
          <Link href={signedIn ? '/dashboard' : '/login'} className={buttonClass('primary', 'md', 'mt-6')}>
            {signedIn ? 'Open your dashboard' : 'Sign in to your dashboard'}
          </Link>
        )}
      </section>
    </Shell>
  );
}
