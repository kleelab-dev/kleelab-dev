import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { PageHeading } from '@/components/money/offline/fields';
import { OfflineInvoiceForm } from '@/components/money/offline/OfflineInvoiceForm';

export const metadata: Metadata = {
  title: 'New invoice',
};

export default function NewOfflineInvoicePage() {
  return (
    <div className="max-w-3xl">
      <PageHeading title="New invoice">For work that was agreed and paid outside a project. Pick or add the contact, then list what it is for.</PageHeading>
      <MoneyTabs />
      <div className="mt-6">
        <Suspense>
          <OfflineInvoiceForm />
        </Suspense>
      </div>
    </div>
  );
}
