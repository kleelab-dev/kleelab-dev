import type { Metadata } from 'next';
import { LeadView } from '@/components/leads/LeadView';

export const metadata: Metadata = {
  title: 'Enquiry',
};

/** `params` is a Promise in Next 16. */
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadView leadId={id} />;
}
