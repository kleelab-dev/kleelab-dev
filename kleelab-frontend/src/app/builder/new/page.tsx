import { BuilderWorkspace } from '@/components/BuilderWorkspace';

export const metadata = { title: 'New site' };

/** New-site onboarding: pick a template, then build. */
export default function NewSitePage() {
  return <BuilderWorkspace />;
}
