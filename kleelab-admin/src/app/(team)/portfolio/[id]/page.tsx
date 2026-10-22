import { PortfolioEditor } from '@/components/portfolio/PortfolioEditor';

export default async function PortfolioItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PortfolioEditor itemId={id} />;
}
