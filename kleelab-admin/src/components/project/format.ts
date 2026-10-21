import type { ApprovalStatus, AttentionItem, AttentionKind, Currency, InvoiceStatus, Lead, LeadStatus, MoneyTotal, ProjectStatus, RequestKind, RequestStatus, StageStatus } from '@/types/api';

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(date.getTime()) ? iso : DATE.format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}

/** `YYYY-MM-DD` for a date input, from whatever the API sent. */
export function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/** Whole days since a date, said the way a person would. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 0) return formatDate(iso);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export const CURRENCIES: Currency[] = ['USD', 'GBP', 'EUR', 'NGN', 'CAD', 'AUD'];

export function formatMoney(cents: number, currency: Currency | string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: string }> = {
  active: { label: 'In progress', tone: 'bg-cobalt-soft text-cobalt-dark' },
  on_hold: { label: 'Paused', tone: 'bg-sun-soft text-ink' },
  completed: { label: 'Finished', tone: 'bg-mint text-ink' },
  cancelled: { label: 'Cancelled', tone: 'bg-line text-muted' },
};

export const STAGE_STATUS: Record<StageStatus, { label: string; tone: string }> = {
  upcoming: { label: 'Not started', tone: 'bg-white text-muted border-line' },
  in_progress: { label: 'Working on it', tone: 'bg-cobalt text-white border-cobalt' },
  waiting_on_client: { label: 'Waiting for you', tone: 'bg-sun text-ink border-ink' },
  done: { label: 'Done', tone: 'bg-mint text-ink border-ink' },
};

/** How a step reads to the team, where the client is "they", not "you". */
export function stageLabel(status: StageStatus, team = false): string {
  return team && status === 'waiting_on_client' ? 'Waiting for the client' : STAGE_STATUS[status].label;
}

export const APPROVAL_STATUS: Record<ApprovalStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Approved',
  changes_requested: 'Changes asked for',
};

export const REQUEST_KIND: Record<RequestKind, { label: string; hint: string }> = {
  deployment: { label: 'Help going live', hint: 'We connect your web address, set up security and email, and launch it.' },
  hosting: { label: 'Hosting', hint: 'We keep it online, watch it and back it up for you.' },
  maintenance: { label: 'Monthly care', hint: 'Updates, fixes and small changes every month.' },
  change: { label: 'A change', hint: 'Something new, or something done differently.' },
};

export const REQUEST_STATUS: Record<RequestStatus, { label: string; teamLabel: string; tone: string }> = {
  open: { label: 'We have it', teamLabel: 'New, needs an answer', tone: 'bg-sun-soft text-ink' },
  accepted: { label: 'Agreed', teamLabel: 'Agreed', tone: 'bg-cobalt-soft text-cobalt-dark' },
  declined: { label: 'Not possible', teamLabel: 'Said no', tone: 'bg-line text-muted' },
  done: { label: 'Done', teamLabel: 'Done', tone: 'bg-mint text-ink' },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: string }> = {
  unpaid: { label: 'To pay', tone: 'bg-sun text-ink' },
  paid: { label: 'Paid', tone: 'bg-mint text-ink' },
  cancelled: { label: 'Cancelled', tone: 'bg-line text-muted' },
};

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: string }> = {
  new: { label: 'New', tone: 'bg-sun text-ink' },
  contacted: { label: 'We replied', tone: 'bg-cobalt-soft text-cobalt-dark' },
  won: { label: 'Became a client', tone: 'bg-mint text-ink' },
  lost: { label: 'Not going ahead', tone: 'bg-line text-muted' },
};

/** Today as `YYYY-MM-DD` in the viewer's time zone, for comparing with date-only fields. */
export function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** An open enquiry whose follow-up day has come. */
export function followUpDue(lead: Pick<Lead, 'follow_up_on' | 'status'>): boolean {
  return Boolean(lead.follow_up_on) && lead.follow_up_on! <= todayISO() && (lead.status === 'new' || lead.status === 'contacted');
}

/** An unpaid invoice past its pay-by date. */
export function isOverdue(invoice: { status: string; due_date: string | null }): boolean {
  return invoice.status === 'unpaid' && Boolean(invoice.due_date) && invoice.due_date! < todayISO();
}

/** Add invoices up per currency. */
export function sumInvoices(invoices: { amount_cents: number; currency: string }[]): MoneyTotal[] {
  const totals = new Map<string, MoneyTotal>();
  for (const invoice of invoices) {
    const entry = totals.get(invoice.currency) ?? { currency: invoice.currency, cents: 0, count: 0 };
    entry.cents += invoice.amount_cents;
    entry.count += 1;
    totals.set(invoice.currency, entry);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Totals in several currencies, written as one line: "₦1,200,000.00 + $500.00". */
export function formatTotals(totals: MoneyTotal[]): string {
  return totals.length ? totals.map((t) => formatMoney(t.cents, t.currency)).join(' + ') : formatMoney(0, 'NGN');
}

export const ATTENTION: Record<AttentionKind, { label: string; tone: string }> = {
  new_enquiry: { label: 'New enquiry', tone: 'bg-sun text-ink' },
  follow_up: { label: 'Follow up', tone: 'bg-sun-soft text-ink' },
  client_message: { label: 'Reply needed', tone: 'bg-danger-soft text-danger' },
  open_request: { label: 'Asked for extra', tone: 'bg-cobalt-soft text-cobalt-dark' },
  waiting_approval: { label: 'Waiting on client', tone: 'bg-line text-ink' },
  overdue_step: { label: 'Late', tone: 'bg-danger-soft text-danger' },
  unpaid_invoice: { label: 'Not paid', tone: 'bg-sun-soft text-ink' },
};

export function attentionHref(item: AttentionItem): string {
  if (item.project_id) return `/projects/${item.project_id}`;
  return item.lead_id ? `/leads/${item.lead_id}` : '/leads';
}

export function leadSource(source: string): string {
  if (source === 'chat') return 'From the chat';
  if (source === 'marketing') return 'From the contact form';
  return `From ${source.replace(/_/g, ' ')}`;
}

const BUDGETS: Record<string, string> = {
  under_500k: 'Under ₦500k',
  '500k_1_5m': '₦500k to ₦1.5m',
  '1_5m_5m': '₦1.5m to ₦5m',
  over_5m: 'Over ₦5m',
  // Older enquiries, from before budgets were in naira.
  under_5k: 'Under $5,000',
  '5k_15k': '$5,000 to $15,000',
  '15k_50k': '$15,000 to $50,000',
  over_50k: 'Over $50,000',
  unsure: 'Not sure yet',
};

export function budgetLabel(budget: string | null): string | null {
  if (!budget) return null;
  const own = /^ngn_(\d+)$/.exec(budget);
  if (own) return `₦${Number(own[1]).toLocaleString('en-NG')} (their figure)`;
  return BUDGETS[budget] ?? budget.replace(/_/g, ' ');
}

/** A team member's name, with their email when two people share it. */
export function staffLabel(member: { name: string; email: string }, everyone: { name: string }[]): string {
  return everyone.filter((m) => m.name === member.name).length > 1 ? `${member.name} (${member.email})` : member.name;
}

export function errorText(reason: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
