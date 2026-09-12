import { fetchPublicSite } from '@/lib/publicApi';

/** Per-site robots.txt pointing at that site's sitemap. */
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

  const body = `User-agent: *\nAllow: /\n\nSitemap: ${origin}/s/${subdomain}/sitemap.xml\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300',
    },
  });
}
