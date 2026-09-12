import { NextResponse, type NextRequest } from 'next/server';

/**
 * Host-based routing for published sites.
 *
 * - `{subdomain}.{SITES_DOMAIN}` is rewritten to the path-served route
 *   `/s/{subdomain}` so the same renderer handles both.
 * - Any other host (a customer's custom domain) is resolved against the public
 *   API, then rewritten the same way.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy`; this runs on the
 * Node.js runtime.
 */

const SITES_DOMAIN = (process.env.SITES_DOMAIN || 'kleelab.com').toLowerCase();
const API_URL = (process.env.API_URL || 'http://localhost:8000').replace(/\/$/, '');

/** Subdomains that belong to the product itself, not to a customer site. */
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin', 'dashboard', 'status']);
/** Hosts that are infrastructure, not customer sites. */
const INFRASTRUCTURE_SUFFIXES = ['.onrender.com', '.vercel.app', '.netlify.app'];

const STATIC_FILE = /\.[a-z0-9]+$/i;
/** Extensioned paths that should still be served by a published site. */
const SITE_FILES = new Set(['/robots.txt', '/sitemap.xml']);

/** Short-lived cache so a custom domain does not hit the API on every request. */
const resolveCache = new Map<string, { value: string | null; expires: number }>();

async function resolveCustomDomain(host: string): Promise<string | null> {
  const cached = resolveCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const response = await fetch(
      `${API_URL}/api/public/resolve?host=${encodeURIComponent(host)}`,
      { cache: 'no-store' },
    );
    const value = response.ok ? ((await response.json()).subdomain as string) || null : null;
    resolveCache.set(host, { value, expires: Date.now() + 60_000 });
    return value;
  } catch {
    // Fail open: an API hiccup should not take the whole host down.
    resolveCache.set(host, { value: null, expires: Date.now() + 10_000 });
    return null;
  }
}

function serveSite(request: NextRequest, subdomain: string) {
  const { pathname, search } = request.nextUrl;
  const target = pathname === '/' ? '' : pathname;
  const url = new URL(`/s/${subdomain}${target}${search}`, request.url);
  return NextResponse.rewrite(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Already served by path; leave it alone.
  if (pathname.startsWith('/s/')) return NextResponse.next();

  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1') return NextResponse.next();
  if (INFRASTRUCTURE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return NextResponse.next();

  // Static assets stay on the app unless a site explicitly provides them.
  if (STATIC_FILE.test(pathname) && !SITE_FILES.has(pathname)) return NextResponse.next();
  if (pathname.startsWith('/_next')) return NextResponse.next();

  // The platform apex is the product's own site.
  if (host === SITES_DOMAIN) return NextResponse.next();

  // A subdomain of the platform domain.
  if (host.endsWith(`.${SITES_DOMAIN}`)) {
    const subdomain = host.slice(0, -(SITES_DOMAIN.length + 1));
    if (!subdomain || subdomain.includes('.') || RESERVED_SUBDOMAINS.has(subdomain)) {
      return NextResponse.next();
    }
    return serveSite(request, subdomain);
  }

  // Anything else is a custom domain.
  const subdomain = await resolveCustomDomain(host);
  if (subdomain) return serveSite(request, subdomain);

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)'],
};
