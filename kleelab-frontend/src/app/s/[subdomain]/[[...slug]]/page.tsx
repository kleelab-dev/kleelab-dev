import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentRenderer } from '@/components/render/registry';
import { parseDocument } from '@/lib/document';
import { fetchPublicPage } from '@/lib/publicApi';

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

  return (
    <main className="min-h-screen bg-paper text-ink">
      <DocumentRenderer document={document} />
    </main>
  );
}
