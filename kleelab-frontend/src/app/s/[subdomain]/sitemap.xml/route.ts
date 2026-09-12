import { fetchPublicSite, publicPathForSlug } from '@/lib/publicApi';

/** Per-site sitemap, generated from the published site's page list. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ subdomain: string }> },
) {
  const { subdomain } = await params;
  const origin = new URL(request.url).origin;

  const site = await fetchPublicSite(subdomain).catch(() => null);
  if (!site) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  const entries = site.pages
    .map((page) => {
      const loc = publicPathForSlug(subdomain, page.slug, origin).replace(/&/g, '&amp;');
      return `  <url><loc>${loc}</loc></url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300',
    },
  });
}
