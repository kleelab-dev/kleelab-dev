import type { Metadata } from 'next';
import { ProposalEditor } from '@/components/proposals/ProposalEditor';

export const metadata: Metadata = {
  title: 'Proposal',
};

/** `params` is a Promise in Next 16. */
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalEditor proposalId={id} />;
}
