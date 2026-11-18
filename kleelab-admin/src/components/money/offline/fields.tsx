'use client';

import { useId } from 'react';
import { clsx } from 'clsx';
import { CheckIcon } from '@heroicons/react/24/outline';
import { PAYMENT_METHOD } from '@/components/project/format';
import type { PaymentMethod } from '@/types/api';

interface ControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

/** A labelled control with its hint and its error beside it. The control gets its id and aria props from here. */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  className?: string;
  children: (props: ControlProps) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Bank transfer, Cash or Other, as a radio group. */
export function MethodField({ value, onChange, error }: { value: PaymentMethod; onChange: (value: PaymentMethod) => void; error?: string | null }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="label">Method</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map((method) => (
          <label
            key={method}
            className={clsx(
              'inline-flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3.5 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt',
              value === method ? 'border-ink bg-ink text-paper' : 'border-line bg-white hover:border-ink',
            )}
          >
            <input type="radio" name={name} value={method} checked={value === method} onChange={() => onChange(method)} className="sr-only" />
            {PAYMENT_METHOD[method]}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </fieldset>
  );
}

/** A problem with a save, above the buttons. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
      {message}
    </p>
  );
}

/** The mint "it worked" line the rest of Money uses. */
export function Notice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="status" className={clsx('flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-mint p-3 text-sm text-ink', className)}>
      <CheckIcon className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** A small outlined action, the same shape as the buttons in the Money rows. */
export const chipClass =
  'inline-flex min-h-10 items-center gap-1 rounded-full border-[1.5px] border-line px-3 py-1 text-xs font-semibold text-ink no-underline hover:border-ink disabled:opacity-50';

/** The "team" tag and the one h1 each Money screen has. */
export function PageHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="tag">team</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">{title}</h1>
      {children && <p className="mt-3 text-muted">{children}</p>}
    </div>
  );
}
