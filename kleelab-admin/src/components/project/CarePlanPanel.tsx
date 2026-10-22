'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { apiService } from '@/services/api';
import type { CareInterval, CarePlan, CarePlanInput, CareStatus, Currency, ProjectDetail } from '@/types/api';
import { Pill } from './Pill';
import { CARE_INTERVAL, CARE_STATUS, CURRENCIES, formatDate, formatMinutes, formatMoney, todayISO } from './format';

type Save = (work: () => Promise<ProjectDetail>) => Promise<void>;
type Form = { name: string; includes: string; amount: string; currency: Currency; interval: CareInterval; hours: string; first: string };

const BLANK: Form = {
  name: 'Care plan',
  includes: 'Software and security updates\nDaily backups\nUp to 2 hours of small changes',
  amount: '',
  currency: 'NGN',
  interval: 'month',
  hours: '2',
  first: todayISO(),
};

function fromPlan(plan: CarePlan): Form {
  return {
    name: plan.name,
    includes: plan.includes ?? '',
    amount: String(plan.amount_cents / 100),
    currency: plan.currency,
    interval: plan.interval,
    hours: plan.minutes_included ? String(plan.minutes_included / 60) : '',
    first: plan.next_bill_on,
  };
}

/** The form's values as the API wants them, or a reason they can't be sent. */
function read(form: Form): CarePlanInput | string {
  const amount = Number(form.amount);
  if (!form.name.trim()) return 'Give the plan a name.';
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter what the plan costs.';
  let minutes: number | null = null;
  if (form.hours.trim()) {
    const hours = Number(form.hours);
    if (!Number.isFinite(hours) || hours < 0.25) return 'Hours included should be at least 0.25, or left empty.';
    minutes = Math.round(hours * 60);
  }
  return {
    name: form.name.trim(),
    includes: form.includes.trim() || null,
    amount_cents: Math.round(amount * 100),
    currency: form.currency,
    interval: form.interval,
    minutes_included: minutes,
  };
}

/**
 * Looking after the site once it is live. A plan bills itself in advance on its
 * date each month or year; the client sees it on their project page.
 */
export function CarePlanPanel({ project, save }: { project: ProjectDetail; save: Save }) {
  const plan = project.care_plan ?? null;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<ProjectDetail>) {
    setBusy(true);
    try {
      await save(work);
      return true;
    } catch {
      // Shown by `save`.
      return false;
    } finally {
      setBusy(false);
    }
  }

  function setStatus(status: CareStatus) {
    if (!plan) return;
    const words: Record<CareStatus, string> = {
      paused: `Pause ${plan.name}? No invoices go out until you resume it. The client gets an email.`,
      active: `Resume ${plan.name}? If its billing date has passed, the client is billed straight away.`,
      ended: `End ${plan.name}? It stops billing for good and the client gets an email. Invoices already sent stay.`,
    };
    if (window.confirm(words[status])) run(() => apiService.adminUpdateCarePlan(plan.id, { status }));
  }

  if (!plan || editing) {
    return (
      <PlanForm
        plan={plan}
        busy={busy}
        onCancel={plan ? () => setEditing(false) : undefined}
        onSubmit={async (input, first) => {
          const ok = plan
            ? await run(() => apiService.adminUpdateCarePlan(plan.id, { ...input, next_bill_on: first }))
            : await run(() => apiService.adminStartCarePlan(project.id, { ...input, first_bill_on: first }));
          if (ok) setEditing(false);
        }}
      />
    );
  }

  const status = CARE_STATUS[plan.status];
  const used = plan.minutes_used ?? 0;
  const over = plan.minutes_included !== null && used > plan.minutes_included;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{plan.name}</span>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>
      <p className="font-display text-2xl font-extrabold">
        {formatMoney(plan.amount_cents, plan.currency)}
        <span className="ml-1 text-sm font-normal text-muted">{CARE_INTERVAL[plan.interval].per}</span>
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-label text-muted">Next invoice</dt>
          <dd className="mt-0.5">{plan.status === 'paused' ? 'Paused' : formatDate(plan.next_bill_on)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-label text-muted">Since</dt>
          <dd className="mt-0.5">{formatDate(plan.started_on)}</dd>
        </div>
      </dl>
      {plan.minutes_included !== null && (
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span>Hours this period</span>
            <span className={over ? 'font-semibold text-danger' : 'text-muted'}>
              {formatMinutes(used)} of {formatMinutes(plan.minutes_included)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full border-[1.5px] border-ink bg-white" aria-hidden>
            <div
              className={over ? 'h-full bg-danger' : 'h-full bg-cobalt'}
              style={{ width: `${Math.min(100, (used / plan.minutes_included) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            From {formatDate(plan.period_start)} to the next invoice. Time logged below counts here.
          </p>
        </div>
      )}
      {plan.includes && (
        <ul className="grid gap-1 text-sm">
          {plan.includes.split('\n').filter((l) => l.trim()).map((line, i) => (
            <li key={i} className="flex gap-2"><span aria-hidden className="text-cobalt">·</span>{line}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setEditing(true)}>Edit</Button>
        {plan.status === 'active' ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setStatus('paused')}>Pause</Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setStatus('active')}>Resume</Button>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setStatus('ended')}>End plan</Button>
      </div>
    </div>
  );
}

function PlanForm({
  plan,
  busy,
  onCancel,
  onSubmit,
}: {
  plan: CarePlan | null;
  busy: boolean;
  onCancel?: () => void;
  onSubmit: (input: CarePlanInput, first: string) => void;
}) {
  const [form, setForm] = useState<Form>(plan ? fromPlan(plan) : BLANK);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (field: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setProblem(null);
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = read(form);
    if (typeof input === 'string') {
      setProblem(input);
      return;
    }
    if (!form.first) {
      setProblem(plan ? 'Pick the next billing date.' : 'Pick the day of the first invoice.');
      return;
    }
    if (!plan && form.first <= todayISO()) {
      if (!window.confirm('Start the plan? The first invoice goes to the client today.')) return;
    }
    onSubmit(input, form.first);
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      {!plan && <p className="text-sm text-muted">No care plan yet. Start one when the site is live and the client wants us to look after it.</p>}
      <div>
        <label htmlFor="care-name" className="label">Name</label>
        <input id="care-name" value={form.name} onChange={set('name')} maxLength={100} className="field text-sm" required />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
        <div>
          <label htmlFor="care-amount" className="label">Price</label>
          <input id="care-amount" type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={set('amount')} className="field text-sm" required />
        </div>
        <div>
          <label htmlFor="care-currency" className="label">Currency</label>
          <select id="care-currency" value={form.currency} onChange={set('currency')} className="field text-sm">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="care-interval" className="label">Bills</label>
          <select id="care-interval" value={form.interval} onChange={set('interval')} className="field text-sm">
            {Object.entries(CARE_INTERVAL).map(([value, words]) => <option key={value} value={value}>{words.every}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="care-hours" className="label">Hours included</label>
          <input id="care-hours" type="number" min="0" step="0.25" inputMode="decimal" value={form.hours} onChange={set('hours')} className="field text-sm" placeholder="Not counted" />
        </div>
      </div>
      <div>
        <label htmlFor="care-includes" className="label">What it covers</label>
        <textarea id="care-includes" rows={3} maxLength={3000} value={form.includes} onChange={set('includes')} className="field text-sm" />
        <p className="mt-1 text-xs text-muted">One thing per line. The client sees this.</p>
      </div>
      <div>
        <label htmlFor="care-first" className="label">{plan ? 'Next invoice on' : 'First invoice on'}</label>
        <input id="care-first" type="date" value={form.first} onChange={set('first')} className="field text-sm" required />
        <p className="mt-1 text-xs text-muted">Each invoice pays for the {form.interval} ahead and gives the client 7 days.</p>
      </div>
      {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : plan ? 'Save changes' : 'Start the plan'}</Button>
        {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>}
      </div>
    </form>
  );
}
