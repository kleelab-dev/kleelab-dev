import { SITE_URL } from '@/lib/site';
import type { MetadataRoute } from 'next';

const BASE = SITE_URL;

/**
 * robots.txt for the product and marketing site.
 *
 * Published customer sites serve their own robots.txt from
 * `/s/[subdomain]/robots.txt`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/admin', '/api', '/verify-email', '/reset-password', '/proposal'] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
