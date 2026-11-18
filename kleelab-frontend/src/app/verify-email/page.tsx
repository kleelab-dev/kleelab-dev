import { redirect } from 'next/navigation';

/**
 * Email verification belonged to self sign-up, which is gone: invited clients are
 * verified when they set their password. Old links land on sign-in instead.
 */
export default function VerifyEmailPage() {
  redirect('/login');
}
