'use client';

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { formatMoney } from '@/components/project/format';
import type { Currency } from '@/types/api';
import { draftAmount, draftsTotal, MAX_LINES, newLine, type LineDraft } from './helpers';

const iconButton =
  'rounded-full border-[1.5px] border-line p-1.5 text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Description, quantity and unit price for each line, with a live total.
 * Prices are typed in major units ("1500.50") and parsed as text into whole
 * cents, so the total shown is exactly the one the server works out.
 */
export function LineItemsEditor({
  lines,
  onChange,
  currency,
  error,
  disabled = false,
}: {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  currency: Currency;
  error?: string | null;
  disabled?: boolean;
}) {
  function update(key: string, patch: Partial<LineDraft>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function move(index: number, by: -1 | 1) {
    const next = [...lines];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  const total = draftsTotal(lines);

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="label">Line items</legend>
      <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_5rem_8rem_8rem_7.5rem] gap-3 px-1 pb-1 font-mono text-[10px] uppercase tracking-label text-muted sm:grid">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit price</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      <ol className="grid gap-3">
        {lines.map((line, index) => {
          const amount = draftAmount(line);
          const n = index + 1;
          return (
            <li key={line.key} className="grid gap-3 rounded-xl border-[1.5px] border-line bg-white p-3 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_8rem_7.5rem] sm:items-center sm:border-0 sm:bg-transparent sm:p-0">
              <div className="min-w-0">
                <label htmlFor={`${line.key}-d`} className="label sm:sr-only">
                  Line {n} description
                </label>
                <input
                  id={`${line.key}-d`}
                  value={line.description}
                  onChange={(e) => update(line.key, { description: e.target.value })}
                  maxLength={300}
                  autoComplete="off"
                  placeholder="What was done or sold"
                  className="field py-2.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <div>
                  <label htmlFor={`${line.key}-q`} className="label sm:sr-only">
                    Line {n} quantity
                  </label>
                  <input
                    id={`${line.key}-q`}
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                    inputMode="numeric"
                    autoComplete="off"
                    className="field py-2.5"
                  />
                </div>
                <div>
                  <label htmlFor={`${line.key}-p`} className="label sm:sr-only">
                    Line {n} unit price
                  </label>
                  <input
                    id={`${line.key}-p`}
                    value={line.price}
                    onChange={(e) => update(line.key, { price: e.target.value })}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    className="field py-2.5"
                  />
                </div>
              </div>
              <p className="flex items-center justify-between gap-2 text-sm sm:block sm:text-right" aria-live="polite">
                <span className="font-mono text-[10px] uppercase tracking-label text-muted sm:hidden">Line {n} amount</span>
                <span className="font-semibold text-ink">{amount === null ? '—' : formatMoney(amount, currency)}</span>
              </p>
              <div className="flex items-center gap-1.5 sm:justify-end">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move line ${n} up`} className={iconButton}>
                  <ArrowUpIcon className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === lines.length - 1} aria-label={`Move line ${n} down`} className={iconButton}>
                  <ArrowDownIcon className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${n}`}
                  className={iconButton}
                >
                  <TrashIcon className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onChange([...lines, newLine()])}
          disabled={lines.length >= MAX_LINES}
          className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink px-3.5 py-1.5 text-sm font-semibold hover:bg-ink hover:text-paper disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" aria-hidden />
          Add a line
        </button>
        <p className="text-sm" aria-live="polite">
          <span className="font-mono text-[11px] uppercase tracking-label text-muted">Total </span>
          <span className="font-display text-xl font-extrabold">{formatMoney(total, currency)}</span>
        </p>
      </div>
      {lines.length >= MAX_LINES && <p className="mt-1 text-xs text-muted">That is the most lines one document can hold.</p>}
    </fieldset>
  );
}
