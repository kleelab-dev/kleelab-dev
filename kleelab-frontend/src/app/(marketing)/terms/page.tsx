import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/LegalPage';
import { terms } from '@/content/legal';

export const metadata: Metadata = {
  title: terms.title,
  description: terms.summary,
};

export default function TermsPage() {
  return <LegalPage doc={terms} />;
}
