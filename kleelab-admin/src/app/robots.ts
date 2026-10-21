import type { MetadataRoute } from 'next';

/** Nothing on the team dashboard belongs in a search engine. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
