import { ClientView } from '@/components/clients/ClientView';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientView clientId={id} />;
}
