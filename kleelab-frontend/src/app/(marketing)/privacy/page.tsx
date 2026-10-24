import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';
import { privacy } from '@/content/legal';

export const metadata: Metadata = {
  title: privacy.title,
  description: privacy.summary,
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return <LegalPage doc={privacy} />;
}
