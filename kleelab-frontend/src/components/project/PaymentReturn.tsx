'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { buttonClass } from '@/components/ui/Button';
import { apiService } from '@/services/api';
import type { PaymentResult } from '@/types/api';
import { errorText, formatMoney } from './format';

// A card payment can take a few seconds to settle at Paystack. Ask again a few
// times before telling the client we are still waiting.
const RETRIES = 5;
const RETRY_MS = 3000;

type View = { kind: 'loading' } | { kind: 'result'; result: PaymentResult } | { kind: 'error'; message: string };

/** Shows how a Paystack payment went, checked with the server rather than read from the URL. */
export function PaymentReturn({ reference }: { reference: string }) {
  const [view, setView] = useState<View>(
    reference ? { kind: 'loading' } : { kind: 'error', message: 'This link is missing the payment reference.' },
  );

  useEffect(() => {
    if (!reference) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (attempt: number) => {
      apiService
        .verifyPayment(reference)
        .then((result) => {
          if (!active) return;
          setView({ kind: 'result', result });
          if (result.status === 'pending' && attempt < RETRIES) {
            timer = setTimeout(() => check(attempt + 1), RETRY_MS);
          }
        })
        .catch((reason) => {
          if (active) setView({ kind: 'error', message: errorText(reason, 'We could not check this payment.') });
        });
    };
    check(1);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [reference]);

  if (view.kind === 'loading') {
    return <p className="font-mono text-[11px] uppercase tracking-label text-muted">Checking your payment…</p>;
  }

  if (view.kind === 'error') {
    return (
      <Card icon={<ExclamationTriangleIcon className="h-7 w-7 text-danger" aria-hidden />} title="We could not check this payment">
        <p className="mt-2 text-sm text-muted">{view.message}</p>
        <p className="mt-2 text-sm text-muted">If you were charged, it will still reach us. Your invoice updates on its own.</p>
        <Link href="/dashboard" className={buttonClass('secondary', 'sm', 'mt-5')}>
          Back to your projects
        </Link>
      </Card>
    );
  }

  const { result } = view;
  const amount = formatMoney(result.amount_cents, result.currency);
  const back = (
    <Link href={`/dashboard/projects/${result.project_id}#invoices`} className={buttonClass('primary', 'sm', 'mt-5')}>
      Back to your project
    </Link>
  );

  if (result.status === 'paid') {
    return (
      <Card icon={<CheckCircleIcon className="h-7 w-7 text-cobalt" aria-hidden />} title="Payment received">
        <p className="mt-2 text-sm text-muted">
          Thank you. {result.invoice_number} ({amount}) is paid.
        </p>
        <p className="mt-1 text-xs text-muted">Reference {result.reference}</p>
        {back}
      </Card>
    );
  }
  if (result.status === 'pending') {
    return (
      <Card icon={<ClockIcon className="h-7 w-7 text-muted" aria-hidden />} title="Waiting for your bank">
        <p className="mt-2 text-sm text-muted">
          We have not had confirmation for {result.invoice_number} yet. This can take a minute. Your invoice will show as paid
          as soon as it arrives, so there is no need to pay again.
        </p>
        <p className="mt-1 text-xs text-muted">Reference {result.reference}</p>
        {back}
      </Card>
    );
  }
  return (
    <Card icon={<ExclamationTriangleIcon className="h-7 w-7 text-danger" aria-hidden />} title={result.status === 'failed' ? 'Payment not completed' : 'We need to check this payment'}>
      <p className="mt-2 text-sm text-muted">
        {result.status === 'failed'
          ? `The payment for ${result.invoice_number} did not go through, and you have not been charged. You can try again from your project.`
          : `Something about the payment for ${result.invoice_number} did not match the invoice. We have been told and will be in touch.`}
      </p>
      <p className="mt-1 text-xs text-muted">Reference {result.reference}</p>
      {back}
    </Card>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card max-w-md p-7">
      {icon}
      <p className="mt-3 font-display text-2xl font-extrabold">{title}</p>
      {children}
    </div>
  );
}
