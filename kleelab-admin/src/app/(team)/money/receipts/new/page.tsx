import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { PageHeading } from '@/components/money/offline/fields';
import { ReceiptForm } from '@/components/money/offline/ReceiptForm';

export const metadata: Metadata = {
  title: 'Record a receipt',
};

export default function NewReceiptPage() {
  return (
    <div className="max-w-3xl">
      <PageHeading title="Record a receipt">For money taken with no invoice. Payments on an invoice get their receipt when you record them there.</PageHeading>
      <MoneyTabs />
      <div className="mt-6">
        <Suspense>
          <ReceiptForm />
        </Suspense>
      </div>
    </div>
  );
}
