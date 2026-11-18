import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { PageHeading } from '@/components/money/offline/fields';
import { ReceiptList } from '@/components/money/offline/ReceiptList';

export const metadata: Metadata = {
  title: 'Receipts',
};

export default function ReceiptsPage() {
  return (
    <div>
      <PageHeading title="Receipts">Every receipt, from invoice payments and from money taken with no invoice.</PageHeading>
      <MoneyTabs />
      <div className="mt-6">
        <Suspense>
          <ReceiptList />
        </Suspense>
      </div>
    </div>
  );
}
