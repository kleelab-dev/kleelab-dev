import { SiteSettings } from '@/components/editor/SiteSettings';

export const metadata = { title: 'Site settings' };

export default async function SiteSettingsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  return <SiteSettings siteId={siteId} />;
}
