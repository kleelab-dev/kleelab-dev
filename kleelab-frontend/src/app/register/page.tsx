import type { Metadata } from 'next';
import { AuthPanel } from '@/components/auth/AuthPanel';
import { safeNext } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Create your account',
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  return <AuthPanel mode="register" next={safeNext(params.next)} />;
}
