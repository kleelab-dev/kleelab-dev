import { OrdersManager } from '@/components/dashboard/OrdersManager';

export const metadata = { title: 'Orders' };

export default async function OrdersPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return <OrdersManager siteId={siteId} />;
}
