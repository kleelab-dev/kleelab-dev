import type { Metadata } from 'next';
import { ProposalView } from '@/components/proposal/ProposalView';

export const metadata: Metadata = {
  title: 'Your proposal',
  robots: { index: false, follow: false },
};

/** The link in a proposal email. The token is the only key, so the page is never indexed. */
export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ProposalView token={token} />;
}
