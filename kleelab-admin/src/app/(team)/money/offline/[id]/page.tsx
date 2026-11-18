import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { OfflineInvoiceView } from '@/components/money/offline/OfflineInvoiceView';

export const metadata: Metadata = {
  title: 'Invoice',
};

export default async function OfflineInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-4xl">
      <MoneyTabs />
      <div className="mt-6">
        <Suspense>
          <OfflineInvoiceView id={id} />
        </Suspense>
      </div>
    </div>
  );
}
