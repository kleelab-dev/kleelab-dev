import type { Metadata } from 'next';
import { AuthPanel } from '@/components/auth/AuthPanel';
import { safeNext } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Client login',
  robots: { index: false, follow: false },
};

/** `searchParams` is a Promise in Next 16; reading it here avoids a Suspense boundary. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  return <AuthPanel next={safeNext(params.next)} />;
}
