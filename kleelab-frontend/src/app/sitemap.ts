import type { MetadataRoute } from 'next';

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kleelab.com').replace(/\/$/, '');

const PAGES: [path: string, priority: number][] = [
  ['/', 1],
  ['/services', 0.9],
  ['/how-we-build', 0.8],
  ['/care', 0.8],
  ['/contact', 0.8],
  ['/work', 0.7],
  ['/about', 0.6],
  ['/privacy', 0.3],
  ['/terms', 0.3],
  ['/cookies', 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map(([path, priority]) => ({
    url: `${BASE}${path === '/' ? '/' : path}`,
    lastModified,
    changeFrequency: 'monthly',
    priority,
  }));
}
