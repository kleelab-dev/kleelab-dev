import type { Metadata } from 'next';
import { TimeView } from '@/components/time/TimeView';

export const metadata: Metadata = {
  title: 'Time',
};

export default function TimePage() {
  return <TimeView />;
}
