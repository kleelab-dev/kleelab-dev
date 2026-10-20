import { redirect } from 'next/navigation';

/** There is no self sign-up: client accounts are created when a project starts. */
export default function RegisterPage() {
  redirect('/contact');
}
