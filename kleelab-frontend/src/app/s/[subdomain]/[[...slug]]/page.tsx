import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentRenderer } from '@/components/render/registry';
import { parseDocument } from '@/lib/document';

/**
 * Published sites, rendered from the stored document.
 *
 * Path-based for now (`/s/{subdomain}` and `/s/{subdomain}/about`); wildcard-host
 * routing arrives once custom domains are wired up. Rendering happens on demand,
 * so there is no generated bundle to upload or cache-invalidate.
 */

const API_URL = (process.env.API_URL || 'http://localhost:8000').replace(/\/$/, '');

type Params = { subdomain: string; slug?: string[] };

type PublicPageResponse = {
  site: { name: string; subdomain: string | null; custom_domain: string | null };
  page: {
    id: string;
    title: string;
    slug: string;
    content: unknown;
    seo: { title?: string | null; description?: string | null; image?: string | null };
  };
};

async function fetchPublicPage(
  subdomain: string,
  slug: string,
): Promise<PublicPageResponse | null> {
  const url = `${API_URL}/api/public/sites/${encodeURIComponent(subdomain)}/page?slug=${encodeURIComponent(slug)}`;
  const response = await fetch(url, { cache: 'no-store' });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to load page (${response.status})`);
  return (await response.json()) as PublicPageResponse;
}

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
