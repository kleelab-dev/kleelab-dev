import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentRenderer } from '@/components/render/registry';
import { CartDrawer } from '@/components/storefront/CartDrawer';
import { CartProvider } from '@/components/storefront/CartProvider';
import { StorefrontProvider } from '@/components/storefront/StorefrontProvider';
import { parseDocument } from '@/lib/document';
import { fetchPublicPage, fetchPublicProducts } from '@/lib/publicApi';

/**
 * Published sites, rendered from the stored document.
 *
 * Path-based for now (`/s/{subdomain}` and `/s/{subdomain}/about`); the request
 * proxy rewrites `{subdomain}.kleelab.com` and custom domains onto these paths.
 * Rendering happens on demand, so there is no generated bundle to upload or
 * cache-invalidate.
 */

type Params = { subdomain: string; slug?: string[] };

function slugFromSegments(segments?: string[]): string {
  if (!segments?.length) return '/';
  return `/${segments.join('/')}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { subdomain, slug } = await params;
  const data = await fetchPublicPage(subdomain, slugFromSegments(slug)).catch(() => null);
  if (!data) return { title: 'Page not found' };

  const { seo, title } = data.page;
  return {
    title: seo.title || `${title} · ${data.site.name}`,
    description: seo.description ?? undefined,
    openGraph: seo.image ? { images: [seo.image] } : undefined,
  };
}

export default async function PublishedPage({ params }: { params: Promise<Params> }) {
  const { subdomain, slug } = await params;
  const data = await fetchPublicPage(subdomain, slugFromSegments(slug));

  if (!data) notFound();

  const document = parseDocument(data.page.content, data.page.title);

  // A missing catalogue must not take the page down; `null` lets the grid say
  // "unavailable" instead of "nothing for sale", which are different things.
  const products = await fetchPublicProducts(subdomain).catch(() => null);

  return (
    <StorefrontProvider
      value={{ subdomain, currency: data.site.currency || 'GBP', products }}
    >
      <CartProvider subdomain={subdomain}>
        {/* No background here: the document paints its own theme, and the host's
            wrapper would otherwise show through on a short page. */}
        <main className="min-h-screen">
          <DocumentRenderer document={document} />
        </main>
        <CartDrawer />
      </CartProvider>
    </StorefrontProvider>
  );
}
