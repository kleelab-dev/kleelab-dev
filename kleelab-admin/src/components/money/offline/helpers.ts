import { ApiError } from '@/services/api';
import type { OfflineLine, OfflineLineInput } from '@/types/api';

/** Most the server accepts for one line or a whole total, in minor units. */
export const MAX_CENTS = 2_000_000_000;
export const MAX_LINES = 50;
export const MAX_QUANTITY = 10_000;

/**
 * Read a typed price such as "1500.50" or "1,500" as whole minor units.
 * It is parsed as text, never multiplied as a float: "19.99" is 1999, not 1998.99999.
 * Returns null when it is not a price with at most two decimals.
 */
export function parseMajor(text: string): number | null {
  const value = text.trim().replace(/,/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Minor units as a plain number for an input: 150000 is "1500.00". */
export function centsToInput(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const part = String(Math.abs(cents % 100)).padStart(2, '0');
  return `${whole}.${part}`;
}

/** A line as typed into the editor: strings, so half-typed values survive. */
export interface LineDraft {
  key: string;
  description: string;
  quantity: string;
  price: string;
}

let counter = 0;
export function newLine(partial: Partial<Omit<LineDraft, 'key'>> = {}): LineDraft {
  counter += 1;
  return { key: `line-${counter}`, description: '', quantity: '1', price: '', ...partial };
}

export function draftsFromLines(lines: OfflineLine[]): LineDraft[] {
  return lines.map((l) => newLine({ description: l.description, quantity: String(l.quantity), price: centsToInput(l.unit_price_cents) }));
}

export function draftQuantity(draft: LineDraft): number | null {
  return /^\d+$/.test(draft.quantity.trim()) && Number(draft.quantity) >= 1 && Number(draft.quantity) <= MAX_QUANTITY ? Number(draft.quantity) : null;
}

/** Cents for one draft, or null while it is not a valid line. */
export function draftAmount(draft: LineDraft): number | null {
  const quantity = draftQuantity(draft);
  const price = parseMajor(draft.price);
  return quantity === null || price === null ? null : quantity * price;
}

export function draftsTotal(drafts: LineDraft[]): number {
  return drafts.reduce((sum, d) => sum + (draftAmount(d) ?? 0), 0);
}

/** The first problem with the lines, in words, or null when they can be sent. */
export function linesProblem(drafts: LineDraft[]): string | null {
  if (drafts.length === 0) return 'Add at least one line.';
  for (let i = 0; i < drafts.length; i += 1) {
    const d = drafts[i];
    const n = i + 1;
    if (!d.description.trim()) return `Line ${n} needs a description.`;
    if (draftQuantity(d) === null) return `Line ${n}: the quantity is a whole number from 1 to ${MAX_QUANTITY.toLocaleString('en-GB')}.`;
    if (parseMajor(d.price) === null) return `Line ${n}: type the price as a number, such as 1500 or 19.99.`;
  }
  const total = draftsTotal(drafts);
  if (total < 1 || total > MAX_CENTS) return 'The total must be more than zero and at most 20,000,000.00.';
  return null;
}

/** Lines as the API wants them. Only call this once `linesProblem` is null. */
export function toLineInputs(drafts: LineDraft[]): OfflineLineInput[] {
  return drafts.map((d) => ({
    description: d.description.trim(),
    quantity: draftQuantity(d) ?? 1,
    unit_price_cents: parseMajor(d.price) ?? 0,
  }));
}

/** An empty or blank string as null, for the optional fields. */
export function orNull(text: string): string | null {
  const value = text.trim();
  return value ? value : null;
}

export interface FormProblem {
  /** Messages by field name, as the server named it (`title`, `email`, `amount_cents`...). */
  fields: Record<string, string>;
  /** Everything else, or a joined summary, to show above the form. */
  message: string;
}

/**
 * Turn a failed save into words, with the field each 422 is about.
 * FastAPI sends `details` as a list of `{loc, msg}`; anything else is just the message.
 */
export function formProblem(reason: unknown): FormProblem {
  if (!(reason instanceof Error)) return { fields: {}, message: 'Something went wrong. Please try again.' };
  const details: unknown = reason instanceof ApiError ? reason.details : undefined;
  if (!(reason instanceof ApiError) || reason.code !== 'validation_error' || !Array.isArray(details)) {
    return { fields: {}, message: reason.message || 'Something went wrong. Please try again.' };
  }
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const item of details as { loc?: unknown[]; msg?: unknown }[]) {
    const msg = String(item?.msg ?? '').replace(/^Value error,\s*/i, '');
    if (!msg) continue;
    const path = (item.loc ?? []).filter((part) => part !== 'body').map(String);
    const name = [...path].reverse().find((part) => Number.isNaN(Number(part))) ?? '';
    // A line item problem reads "Line 2: ..." so staff can find the row.
    const lineAt = path.indexOf('lines');
    const lineNo = lineAt >= 0 && path[lineAt + 1] !== undefined ? Number(path[lineAt + 1]) + 1 : null;
    if (lineNo !== null && !Number.isNaN(lineNo)) {
      general.push(`Line ${lineNo}: ${msg}`);
    } else if (name && !(name in fields)) {
      fields[name] = msg;
    } else {
      general.push(msg);
    }
  }
  const everything = [...general, ...Object.values(fields)];
  return { fields, message: everything.length ? everything.join(' ') : reason.message };
}

/** The field errors without the ones about the contact, once a contact has been picked. */
export function clearContactError(fields: Record<string, string>): Record<string, string> {
  const rest = { ...fields };
  delete rest.contact;
  delete rest.contact_id;
  return rest;
}
