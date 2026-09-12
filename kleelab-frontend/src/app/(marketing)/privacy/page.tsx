import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/LegalPage';
import { privacy } from '@/content/legal';

export const metadata: Metadata = {
  title: privacy.title,
  description: privacy.summary,
};

export default function PrivacyPage() {
  return <LegalPage doc={privacy} />;
}
