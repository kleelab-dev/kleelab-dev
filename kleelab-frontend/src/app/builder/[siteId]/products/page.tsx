import { ProductsManager } from '@/components/dashboard/ProductsManager';

export const metadata = { title: 'Products' };

export default async function ProductsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  return <ProductsManager siteId={siteId} />;
}
