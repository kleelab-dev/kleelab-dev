import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';
import { cookies } from '@/content/legal';

export const metadata: Metadata = {
  title: cookies.title,
  description: cookies.summary,
  alternates: { canonical: '/cookies' },
};

export default function CookiesPage() {
  return <LegalPage doc={cookies} />;
}
