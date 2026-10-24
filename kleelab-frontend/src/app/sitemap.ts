import { SITE_URL } from '@/lib/site';
import type { MetadataRoute } from 'next';
import { getPortfolio } from '@/lib/portfolio';

const BASE = SITE_URL;

const PAGES: [path: string, priority: number][] = [
  ['/', 1],
  ['/services', 0.9],
  ['/how-we-build', 0.8],
  ['/care', 0.8],
  ['/contact', 0.8],
  ['/book', 0.8],
  ['/portfolio', 0.8],
  ['/work', 0.7],
  ['/about', 0.6],
  ['/privacy', 0.3],
  ['/terms', 0.3],
  ['/cookies', 0.3],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const pages: MetadataRoute.Sitemap = PAGES.map(([path, priority]) => ({
    url: `${BASE}${path === '/' ? '/' : path}`,
    lastModified,
    changeFrequency: 'monthly',
    priority,
  }));
  const items: MetadataRoute.Sitemap = (await getPortfolio()).map((item) => ({
    url: `${BASE}/portfolio/${item.slug}`,
    lastModified: new Date(item.updated_at),
    changeFrequency: 'monthly',
    priority: 0.6,
    images: item.images.slice(0, 1).map((image) => image.url),
  }));
  return [...pages, ...items];
}
