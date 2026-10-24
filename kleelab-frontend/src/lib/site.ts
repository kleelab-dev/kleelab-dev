/**
 * The site's public address, with no trailing slash.
 *
 * It is the www host because the bare domain redirects there: search engines
 * do not index a URL that redirects, so the sitemap, canonical tags and
 * structured data must all name the address that actually serves the page.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.kleelab.com').replace(/\/$/, '');
