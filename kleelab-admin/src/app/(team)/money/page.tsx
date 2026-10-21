import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MoneyView } from '@/components/money/MoneyView';

export const metadata: Metadata = {
  title: 'Money',
};

export default function MoneyPage() {
  return (
    <Suspense>
      <MoneyView />
    </Suspense>
  );
}
