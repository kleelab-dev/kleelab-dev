import type { Metadata } from 'next';
import { AuthPanel } from '@/components/auth/AuthPanel';
import { safeNext } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

/**
 * A real sign-in page.
 *
 * `searchParams` is a Promise in Next 16. Reading it here, on the server, rather
 * than with `useSearchParams` in the client component also avoids needing a
 * Suspense boundary around the whole form.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  return <AuthPanel mode="login" next={safeNext(params.next)} />;
}
