import { ClientProjectView } from '@/components/project/ClientProjectView';

export default async function ClientProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientProjectView projectId={id} />;
}
