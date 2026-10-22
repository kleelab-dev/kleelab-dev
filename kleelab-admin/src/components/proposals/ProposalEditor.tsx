'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PaperAirplaneIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button, buttonClass } from '@/components/ui/Button';
import { CopyEmail } from '@/components/ui/CopyEmail';
import { Panel, Pill } from '@/components/project/Pill';
import { CURRENCIES, errorText, formatDate, formatDateTime, formatMoney, PROPOSAL_STATUS, todayISO } from '@/components/project/format';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import type { Currency, ProposalDetail, ProposalInput } from '@/types/api';

interface ItemRow { description: string; amount: string }
interface StageRow { name: string; description: string }

interface Form {
  title: string;
  client_name: string;
  client_email: string;
  summary: string;
  scope: string;
  items: ItemRow[];
  currency: Currency;
  deposit_percent: string;
  duration_weeks: string;
  stages: StageRow[];
  terms: string;
  valid_until: string;
}

function toForm(p: ProposalDetail): Form {
  return {
    title: p.title,
    client_name: p.client_name ?? '',
    client_email: p.client_email,
    summary: p.summary ?? '',
    scope: p.scope ?? '',
    items: p.items.length ? p.items.map((i) => ({ description: i.description, amount: String(i.amount_cents / 100) })) : [{ description: '', amount: '' }],
    currency: p.currency,
    deposit_percent: String(p.deposit_percent),
    duration_weeks: p.duration_weeks ? String(p.duration_weeks) : '',
    stages: p.stages.map((s) => ({ name: s.name, description: s.description ?? '' })),
    terms: p.terms ?? '',
    valid_until: p.valid_until ?? '',
  };
}

function cents(amount: string): number {
  const value = Math.round(Number(amount.replace(/,/g, '')) * 100);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Turn the form into a patch, or say what is wrong with it. */
function toInput(form: Form): ProposalInput | string {
  if (form.title.trim().length < 2) return 'Give the proposal a title.';
  const items = form.items
    .filter((i) => i.description.trim() || i.amount.trim())
    .map((i) => ({ description: i.description.trim(), amount_cents: cents(i.amount) }));
  if (items.some((i) => !i.description)) return 'Every price line needs a description.';
  const stages = form.stages.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), description: s.description.trim() || null }));
  const deposit = Number(form.deposit_percent);
  if (!Number.isInteger(deposit) || deposit < 0 || deposit > 100) return 'The deposit is a whole percentage from 0 to 100.';
  const weeks = form.duration_weeks.trim() ? Number(form.duration_weeks) : null;
  if (weeks !== null && (!Number.isInteger(weeks) || weeks < 1 || weeks > 104)) return 'Weeks is a whole number from 1 to 104.';
  return {
    title: form.title.trim(),
    client_name: form.client_name.trim() || null,
    client_email: form.client_email.trim(),
    summary: form.summary,
    scope: form.scope,
    items,
    currency: form.currency,
    deposit_percent: deposit,
    duration_weeks: weeks,
    stages,
    terms: form.terms,
    valid_until: form.valid_until || null,
  };
}

/** Write, price and send a proposal; then watch for the client's answer. */
export function ProposalEditor({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminProposal(proposalId)
      .then((value) => {
        if (!active) return;
        setProposal(value);
        setForm(toForm(value));
        setDirty(false);
      })
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [proposalId, attempt]);

  const totals = useMemo(() => {
    if (!form) return { total: 0, deposit: 0 };
    const total = form.items.reduce((sum, i) => sum + cents(i.amount), 0);
    const raw = Math.floor((total * (Number(form.deposit_percent) || 0)) / 100);
    return { total, deposit: raw - (raw % 100) };
  }, [form]);

  if (!proposal || !form) {
    return (
      <div>
        <Link href="/leads" className="font-mono text-[11px] uppercase tracking-label text-muted no-underline hover:text-ink">← Enquiries</Link>
        {error ? (
          <ErrorState message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} className="mt-6" />
        ) : (
          <Skeleton rows={3} className="mt-6" />
        )}
      </div>
    );
  }

  // Expired is still stored as sent: moving the date on reopens it.
  const editable = proposal.status === 'draft' || proposal.status === 'sent' || proposal.status === 'expired';
  const status = PROPOSAL_STATUS[proposal.status];

  function change(next: Partial<Form>) {
    setForm((f) => (f ? { ...f, ...next } : f));
    setDirty(true);
    setConfirmSend(false);
    setNotice(null);
  }

  async function run(label: string, action: () => Promise<ProposalDetail | void>, message: string) {
    setBusy(label);
    setError(null);
    try {
      const next = await action();
      if (next) {
        setProposal(next);
        setForm(toForm(next));
        setDirty(false);
      }
      setNotice(message);
      return next;
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<boolean> {
    const input = toInput(form!);
    if (typeof input === 'string') {
      setError(input);
      return false;
    }
    const saved = await run('save', () => apiService.adminUpdateProposal(proposal!.id, input),
      proposal!.status === 'sent' ? 'Saved. Their link now shows this version.' : 'Draft saved.');
    return Boolean(saved);
  }

  async function send() {
    if (dirty && !(await save())) return;
    await run('send', () => apiService.adminSendProposal(proposal!.id), `Sent to ${proposal!.client_email}.`);
    setConfirmSend(false);
  }

  const items = form.items;
  const stages = form.stages;

  return (
    <div>
      <Link href={`/leads/${proposal.lead_id}`} className="font-mono text-[11px] uppercase tracking-label text-muted no-underline hover:text-ink">← Back to the enquiry</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={status.tone}>{status.label}</Pill>
            <span className="font-mono text-xs text-muted">{proposal.reference} · version {proposal.revision}</span>
          </div>
          <h1 className="mt-2 break-words font-display text-3xl font-extrabold tracking-tightest sm:text-4xl">{proposal.title}</h1>
          <p className="mt-1 text-sm text-muted">For {proposal.client_name || proposal.client_email}{proposal.author_name && ` · written by ${proposal.author_name}`}</p>
        </div>
        {proposal.project_id && (
          <Link href={`/projects/${proposal.project_id}`} className={buttonClass('secondary')}>Open the project</Link>
        )}
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
      {notice && !error && (
        <p role="status" className="mt-6 flex items-center gap-2 rounded-xl bg-mint p-3 text-sm text-ink">
          <CheckIcon className="h-4 w-4" aria-hidden />
          {notice}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          className="grid min-w-0 content-start gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={!editable} className="grid min-w-0 gap-6">
            <Panel tag="the pitch" title="What we will do">
              <div className="grid gap-4">
                <div>
                  <label htmlFor="p_title" className="label">Title</label>
                  <input id="p_title" value={form.title} onChange={(e) => change({ title: e.target.value })} maxLength={150} className="field" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="p_name" className="label">Client name</label>
                    <input id="p_name" value={form.client_name} onChange={(e) => change({ client_name: e.target.value })} maxLength={100} className="field" />
                  </div>
                  <div>
                    <label htmlFor="p_email" className="label">Client email</label>
                    <input id="p_email" type="email" value={form.client_email} onChange={(e) => change({ client_email: e.target.value })} className="field" />
                  </div>
                </div>
                <div>
                  <label htmlFor="p_summary" className="label">Summary</label>
                  <textarea id="p_summary" rows={4} value={form.summary} onChange={(e) => change({ summary: e.target.value })} maxLength={8000} className="field leading-6"
                    placeholder="What they told us they need, and how we will solve it." />
                </div>
                <div>
                  <label htmlFor="p_scope" className="label">What is included</label>
                  <textarea id="p_scope" rows={6} value={form.scope} onChange={(e) => change({ scope: e.target.value })} maxLength={12000} className="field leading-6"
                    placeholder={'Five pages: home, about, services, gallery, contact\nOnline shop with up to 50 products\n…'} />
                  <p className="mt-1 text-xs text-muted">One point per line. Be clear about what is not included too.</p>
                </div>
              </div>
            </Panel>

            <Panel tag="the price" title="Price">
              <div className="grid gap-3">
                {items.map((item, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`item_d_${index}`} className={clsx('label', index > 0 && 'sr-only')}>Line</label>
                      <input id={`item_d_${index}`} value={item.description} maxLength={300} placeholder={index === 0 ? 'Design and build' : ''} className="field"
                        onChange={(e) => change({ items: items.map((x, i) => (i === index ? { ...x, description: e.target.value } : x)) })} />
                    </div>
                    <div className="w-32 shrink-0">
                      <label htmlFor={`item_a_${index}`} className={clsx('label', index > 0 && 'sr-only')}>Amount</label>
                      <input id={`item_a_${index}`} inputMode="decimal" value={item.amount} placeholder="500000" className="field text-right font-mono"
                        onChange={(e) => change({ items: items.map((x, i) => (i === index ? { ...x, amount: e.target.value } : x)) })} />
                    </div>
                    <button type="button" aria-label="Remove this line" disabled={items.length === 1}
                      onClick={() => change({ items: items.filter((_, i) => i !== index) })}
                      className="mb-2.5 shrink-0 text-muted hover:text-danger disabled:opacity-30">
                      <TrashIcon className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
                {items.length < 30 && (
                  <button type="button" onClick={() => change({ items: [...items, { description: '', amount: '' }] })}
                    className="flex w-fit items-center gap-1 text-sm font-semibold text-cobalt">
                    <PlusIcon className="h-4 w-4" aria-hidden /> Add a line
                  </button>
                )}
                <div className="mt-2 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="p_currency" className="label">Currency</label>
                    <select id="p_currency" value={form.currency} onChange={(e) => change({ currency: e.target.value as Currency })} className="field">
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="p_deposit" className="label">Deposit %</label>
                    <input id="p_deposit" inputMode="numeric" value={form.deposit_percent} onChange={(e) => change({ deposit_percent: e.target.value })} className="field" />
                  </div>
                  <div>
                    <label htmlFor="p_weeks" className="label">Weeks to build</label>
                    <input id="p_weeks" inputMode="numeric" value={form.duration_weeks} onChange={(e) => change({ duration_weeks: e.target.value })} className="field" placeholder="6" />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel tag="becomes the project plan" title="Steps">
              <div className="grid gap-3">
                {stages.map((stage, index) => (
                  <div key={index} className="flex gap-2 rounded-xl border-[1.5px] border-line p-3">
                    <span className="mt-2 w-5 shrink-0 font-mono text-xs text-muted">{index + 1}</span>
                    <div className="grid min-w-0 flex-1 gap-2">
                      <label htmlFor={`stage_n_${index}`} className="sr-only">Step name</label>
                      <input id={`stage_n_${index}`} value={stage.name} maxLength={80} className="field py-2 font-semibold"
                        onChange={(e) => change({ stages: stages.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)) })} />
                      <label htmlFor={`stage_d_${index}`} className="sr-only">What happens</label>
                      <textarea id={`stage_d_${index}`} rows={2} value={stage.description} maxLength={500} className="field py-2 text-sm" placeholder="What happens in this step"
                        onChange={(e) => change({ stages: stages.map((x, i) => (i === index ? { ...x, description: e.target.value } : x)) })} />
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 text-muted">
                      <button type="button" aria-label="Move up" disabled={index === 0} className="hover:text-ink disabled:opacity-30"
                        onClick={() => change({ stages: swap(stages, index, index - 1) })}>
                        <ArrowUpIcon className="h-4 w-4" aria-hidden />
                      </button>
                      <button type="button" aria-label="Move down" disabled={index === stages.length - 1} className="hover:text-ink disabled:opacity-30"
                        onClick={() => change({ stages: swap(stages, index, index + 1) })}>
                        <ArrowDownIcon className="h-4 w-4" aria-hidden />
                      </button>
                      <button type="button" aria-label="Remove this step" className="hover:text-danger"
                        onClick={() => change({ stages: stages.filter((_, i) => i !== index) })}>
                        <TrashIcon className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
                {stages.length < 12 && (
                  <button type="button" onClick={() => change({ stages: [...stages, { name: '', description: '' }] })}
                    className="flex w-fit items-center gap-1 text-sm font-semibold text-cobalt">
                    <PlusIcon className="h-4 w-4" aria-hidden /> Add a step
                  </button>
                )}
              </div>
            </Panel>

            <Panel tag="the small print" title="Terms">
              <div className="grid gap-4">
                <div>
                  <label htmlFor="p_terms" className="sr-only">Terms</label>
                  <textarea id="p_terms" rows={7} value={form.terms} onChange={(e) => change({ terms: e.target.value })} maxLength={8000} className="field text-sm leading-6" />
                </div>
                <div className="max-w-xs">
                  <label htmlFor="p_valid" className="label">Open until</label>
                  <input id="p_valid" type="date" min={todayISO()} value={form.valid_until} onChange={(e) => change({ valid_until: e.target.value })} className="field" />
                </div>
              </div>
            </Panel>
          </fieldset>

          {editable && (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-paper p-3 shadow-block">
              <Button type="submit" disabled={!dirty || busy !== null}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>
              <span className="text-sm text-muted">
                {dirty ? 'You have changes that are not saved.' : 'All changes saved.'}
                {proposal.status === 'sent' && dirty && ' Saving makes a new version; they will need to reload.'}
              </span>
            </div>
          )}
        </form>

        <aside className="grid content-start gap-6">
          <Panel tag="live" title="Total" className="shadow-block">
            <p className="font-display text-3xl font-extrabold">{formatMoney(totals.total, form.currency)}</p>
            <p className="mt-1 text-sm text-muted">
              Deposit {formatMoney(totals.deposit, form.currency)} ({Number(form.deposit_percent) || 0}%), invoiced when they accept, due in 7 days.
            </p>
          </Panel>

          <Panel tag="where it stands" title={status.label}>
            <StatusDetail proposal={proposal} />

            {proposal.status === 'draft' && (
              <div className="mt-4 grid gap-2">
                <Button variant={confirmSend ? 'sun' : 'primary'} disabled={busy !== null || totals.total === 0}
                  onClick={() => (confirmSend ? void send() : setConfirmSend(true))}>
                  <PaperAirplaneIcon className="h-4 w-4" aria-hidden />
                  {busy === 'send' ? 'Sending…' : confirmSend ? `Yes, email ${form.client_email}` : 'Send to the client'}
                </Button>
                {confirmSend && busy === null && (
                  <button type="button" onClick={() => setConfirmSend(false)} className="text-sm text-muted hover:text-ink">Cancel</button>
                )}
                {totals.total === 0 && <p className="text-xs text-muted">Add a price before you send it.</p>}
              </div>
            )}

            {proposal.public_url && (
              <div className="mt-4 grid gap-1 border-t border-line pt-4 text-sm">
                <p className="font-mono text-[10px] uppercase tracking-label text-muted">Their link</p>
                <CopyEmail email={proposal.public_url} />
                <a href={proposal.public_url} target="_blank" rel="noreferrer" className="w-fit text-xs font-semibold text-cobalt">Open it as they see it</a>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              {(proposal.status === 'sent' || proposal.status === 'expired') && (
                <Button size="sm" variant="danger" disabled={busy !== null}
                  onClick={() => {
                    if (window.confirm('Withdraw this proposal? Their link will say it is no longer open.')) {
                      void run('withdraw', () => apiService.adminWithdrawProposal(proposal.id), 'Withdrawn. Their link no longer accepts answers.');
                    }
                  }}>
                  Withdraw
                </Button>
              )}
              {proposal.status !== 'draft' && proposal.status !== 'accepted' && (
                <Button size="sm" variant="secondary" disabled={busy !== null}
                  onClick={async () => {
                    const copy = await run('copy', () => apiService.adminCopyProposal(proposal.id), 'New draft made from this one.');
                    if (copy) router.push(`/proposals/${copy.id}`);
                  }}>
                  Make a new version
                </Button>
              )}
              {proposal.status === 'draft' && (
                <Button size="sm" variant="ghost" disabled={busy !== null}
                  onClick={async () => {
                    if (!window.confirm('Delete this draft?')) return;
                    await run('delete', () => apiService.adminDeleteProposal(proposal.id), 'Draft deleted.');
                    router.push(`/leads/${proposal.lead_id}`);
                  }}>
                  <TrashIcon className="h-4 w-4" aria-hidden /> Delete draft
                </Button>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function StatusDetail({ proposal }: { proposal: ProposalDetail }) {
  const rows: [string, string][] = [];
  if (proposal.sent_at) rows.push(['Sent', formatDateTime(proposal.sent_at)]);
  if (proposal.sent_at) rows.push(['Opened', proposal.viewed_at ? formatDateTime(proposal.viewed_at) : 'Not yet']);
  if (proposal.valid_until) rows.push([proposal.status === 'expired' ? 'Closed on' : 'Open until', formatDate(proposal.valid_until)]);
  if (proposal.accepted_at) rows.push(['Accepted', `${formatDateTime(proposal.accepted_at)} by ${proposal.accepted_name}`]);
  if (proposal.payment_choice) rows.push(['Paying', proposal.payment_choice === 'full' ? 'Everything up front' : 'Deposit now, the rest at hand-over']);
  if (proposal.declined_at) rows.push(['Declined', formatDateTime(proposal.declined_at)]);

  return (
    <div className="grid gap-3 text-sm">
      {proposal.status === 'draft' && <p className="text-muted">Only the team can see this. Nothing goes to the client until you send it.</p>}
      {proposal.status === 'expired' && <p className="text-muted">The date has passed, so they can no longer accept. Move the date on and save to reopen it, or make a new version.</p>}
      {rows.length > 0 && (
        <dl className="grid gap-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {proposal.decline_reason && (
        <blockquote className="rounded-xl bg-paper p-3 text-ink-soft">&ldquo;{proposal.decline_reason}&rdquo;</blockquote>
      )}
    </div>
  );
}
