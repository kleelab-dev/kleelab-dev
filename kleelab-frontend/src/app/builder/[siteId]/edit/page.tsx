import { ChatBuilder } from '@/components/builder/ChatBuilder';

export const metadata = { title: 'Builder' };

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  return <ChatBuilder siteId={siteId} />;
}
