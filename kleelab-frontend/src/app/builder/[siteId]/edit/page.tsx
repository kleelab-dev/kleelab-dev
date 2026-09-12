import { EditorShell } from '@/components/editor/EditorShell';

export const metadata = { title: 'Editor' };

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  return <EditorShell siteId={siteId} />;
}
