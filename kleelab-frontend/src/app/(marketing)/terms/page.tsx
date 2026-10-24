import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';
import { terms } from '@/content/legal';

export const metadata: Metadata = {
  title: terms.title,
  description: terms.summary,
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return <LegalPage doc={terms} />;
}
