import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/LegalPage';
import { cookies } from '@/content/legal';

export const metadata: Metadata = {
  title: cookies.title,
  description: cookies.summary,
};

export default function CookiesPage() {
  return <LegalPage doc={cookies} />;
}
