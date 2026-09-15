import type { Metadata } from 'next';
import { AiStart } from '@/components/onboarding/AiStart';

export const metadata: Metadata = { title: 'New site' };

/**
 * Starting a site.
 *
 * The onboarding that used to live here opened with a full-screen marketing hero
 * and then required a template — so the product's front door described a manual
 * page builder, and reaching a site took four steps across two marketing screens.
 * The customer now describes what they want instead, and the template path
 * survives as the second option rather than the only one.
 */
export default function NewSitePage() {
  return <AiStart />;
}
