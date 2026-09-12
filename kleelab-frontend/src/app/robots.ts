import type { MetadataRoute } from 'next';

/**
 * robots.txt for the product itself (the builder). Published customer sites
 * serve their own robots.txt from `/s/[subdomain]/robots.txt`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/builder', '/api'] }],
  };
}
