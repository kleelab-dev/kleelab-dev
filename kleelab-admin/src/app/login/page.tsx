import type { Metadata } from 'next';
import { TeamLogin } from '@/components/auth/TeamLogin';
import { safeNext } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Team login',
};

/** `searchParams` is a Promise in Next 16; reading it here avoids a Suspense boundary. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  return <TeamLogin next={safeNext(params.next)} />;
}
