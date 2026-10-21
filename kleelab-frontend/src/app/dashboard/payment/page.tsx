import type { Metadata } from 'next';
import { PaymentReturn } from '@/components/project/PaymentReturn';

export const metadata: Metadata = {
  title: 'Payment',
  robots: { index: false, follow: false },
};

/** Where Paystack sends the client back after paying. It adds `reference` (and `trxref`) to the URL. */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string | string[]; trxref?: string | string[] }>;
}) {
  const { reference, trxref } = await searchParams;
  const value = reference ?? trxref;
  return <PaymentReturn reference={(Array.isArray(value) ? value[0] : value) ?? ''} />;
}
