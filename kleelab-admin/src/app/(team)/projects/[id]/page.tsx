import { AdminProjectView } from '@/components/project/AdminProjectView';

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminProjectView projectId={id} />;
}
