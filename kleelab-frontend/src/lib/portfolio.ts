/**
 * The portfolio, read on the server. Pages keep a copy for five minutes; the API
 * asks /revalidate to drop it the moment an item is saved, so changes show at once.
 */

export type PortfolioKind = 'work' | 'for_sale';

export interface PortfolioImage {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface PortfolioItem {
  kind: PortfolioKind;
  slug: string;
  title: string;
  summary: string;
  body: string | null;
  sector: string | null;
  tags: string[];
  demo_url: string | null;
  images: PortfolioImage[];
  client_name: string | null;
  /** Null once the item is sold. */
  price_cents: number | null;
  currency: string;
  includes: string[];
  customisable: string[];
  delivery_days: number | null;
  exclusive: boolean;
  sold: boolean;
  featured: boolean;
  published_at: string | null;
  updated_at: string;
  preview: boolean;
}

export const PORTFOLIO_TAG = 'portfolio';

const API = (process.env.API_URL || 'http://localhost:8000').replace(/\/$/, '');

/** Everything on the site, featured first. Empty when the API is down, so the page still renders. */
export async function getPortfolio(): Promise<PortfolioItem[]> {
  try {
    const response = await fetch(`${API}/api/portfolio`, { next: { revalidate: 300, tags: [PORTFOLIO_TAG] } });
    return response.ok ? ((await response.json()) as PortfolioItem[]) : [];
  } catch {
    return [];
  }
}

/** One item, or null. A preview link reads it fresh and is never cached. */
export async function getPortfolioItem(slug: string, preview?: string): Promise<PortfolioItem | null> {
  const query = preview ? `?preview=${encodeURIComponent(preview)}` : '';
  const response = await fetch(
    `${API}/api/portfolio/${encodeURIComponent(slug)}${query}`,
    preview ? { cache: 'no-store' } : { next: { revalidate: 300, tags: [PORTFOLIO_TAG] } },
  ).catch(() => null);
  return response?.ok ? ((await response.json()) as PortfolioItem) : null;
}

/** A 1200x630 crop from the top of a Cloudinary screenshot, the size link previews expect. */
export function shareImage(image: PortfolioImage): { url: string; width?: number; height?: number } {
  if (image.url.startsWith('https://res.cloudinary.com/') && image.url.includes('/image/upload/')) {
    return { url: image.url.replace('/image/upload/', '/image/upload/c_fill,g_north,w_1200,h_630,f_jpg,q_auto/'), width: 1200, height: 630 };
  }
  return { url: image.url, width: image.width ?? undefined, height: image.height ?? undefined };
}

export function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toLocaleString('en-NG')}`;
  }
}
