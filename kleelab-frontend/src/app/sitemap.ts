import type { MetadataRoute } from 'next';
import { posts } from '@/content/posts';
import { caseStudies } from '@/content/work';

/**
 * Sitemap for the marketing site.
 *
 * Published customer sites serve their own from `/s/[subdomain]/sitemap.xml`,
 * and the proxy leaves `/sitemap.xml` on the apex alone, so this is the product's
 * own set of pages.
 */
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kleelab.com').replace(/\/$/, '');

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE}/services`, lastModified, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/work`, lastModified, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/about`, lastModified, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${BASE}/contact`, lastModified, changeFrequency: 'yearly', priority: 0.8 },
    { url: `${BASE}/blog`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    // Excluded from search results rather than omitted: these still want to be
    // findable by someone looking for them.
    { url: `${BASE}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/cookies`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const work: MetadataRoute.Sitemap = caseStudies.map((study) => ({
    url: `${BASE}/work/${study.slug}`,
    lastModified,
    changeFrequency: 'yearly',
    priority: 0.7,
  }));

  const notes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'yearly',
    priority: 0.6,
  }));

  return [...pages, ...work, ...notes];
}
