import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Set your password',
  robots: { index: false, follow: false },
};

/** Reached from a staff password reset email. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={Array.isArray(token) ? token[0] : token ?? ''} />;
}
