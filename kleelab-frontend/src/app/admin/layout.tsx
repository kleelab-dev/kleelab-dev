import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';

export const metadata: Metadata = {
  title: 'Team',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell staffOnly>{children}</AppShell>;
}
