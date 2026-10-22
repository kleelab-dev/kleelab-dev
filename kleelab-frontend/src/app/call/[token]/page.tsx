import type { Metadata } from 'next';
import { CallView } from '@/components/call/CallView';

export const metadata: Metadata = {
  title: 'Your call',
  robots: { index: false, follow: false },
};

/** The link in a call confirmation. The token is the only key, so the page is never indexed. */
export default async function CallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CallView token={token} />;
}
