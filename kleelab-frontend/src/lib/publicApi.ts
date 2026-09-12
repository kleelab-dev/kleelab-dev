/**
 * Server-side access to the public site API.
 *
 * Published sites are fetched by the Next.js server, so these helpers use an
 * absolute backend URL rather than the browser's `/api` rewrite.
 */

const API_URL = (process.env.API_URL || 'http://localhost:8000').replace(/\/$/, '');

export type PublicSiteResponse = {
  name: string;
  subdomain: string | null;
  custom_domain: string | null;
  pages: { title: string; slug: string }[];
};

export type PublicPageResponse = {
  site: { name: string; subdomain: string | null; custom_domain: string | null };
  page: {
    id: string;
    title: string;
    slug: string;
    content: unknown;
    seo: { title?: string | null; description?: string | null; image?: string | null };
  };
};

export async function fetchPublicSite(subdomain: string): Promise<PublicSiteResponse | null> {
  const response = await fetch(
    `${API_URL}/api/public/sites/${encodeURIComponent(subdomain)}`,
    { cache: 'no-store' },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to load site (${response.status})`);
  return (await response.json()) as PublicSiteResponse;
}

export async function fetchPublicPage(
  subdomain: string,
  slug: string,
): Promise<PublicPageResponse | null> {
  const response = await fetch(
    `${API_URL}/api/public/sites/${encodeURIComponent(subdomain)}/page?slug=${encodeURIComponent(slug)}`,
    { cache: 'no-store' },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to load page (${response.status})`);
  return (await response.json()) as PublicPageResponse;
}

/** Absolute path for a page slug on a path-served site. */
export function publicPathForSlug(subdomain: string, slug: string, origin: string): string {
  const suffix = !slug || slug === '/' ? '' : slug.startsWith('/') ? slug : `/${slug}`;
  return `${origin}/s/${subdomain}${suffix}`;
}
