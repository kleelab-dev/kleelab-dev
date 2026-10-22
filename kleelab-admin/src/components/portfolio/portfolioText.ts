import type { PortfolioItem, PortfolioItemInput, PortfolioKind, PortfolioStatus } from '@/types/api';

export const KIND_LABEL: Record<PortfolioKind, string> = {
  work: 'Work we built',
  for_sale: 'Ready-made site',
};

export const PORTFOLIO_STATUS: Record<PortfolioStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-line text-ink' },
  published: { label: 'On the site', tone: 'bg-mint text-ink' },
  sold: { label: 'Sold', tone: 'bg-sun text-ink' },
  archived: { label: 'Archived', tone: 'bg-white text-muted border border-line' },
};

export function blankItem(kind: PortfolioKind): PortfolioItemInput {
  return {
    kind,
    title: '',
    slug: null,
    summary: '',
    body: null,
    sector: null,
    tags: [],
    demo_url: null,
    images: [],
    client_name: null,
    client_permission: false,
    price_cents: null,
    currency: 'NGN',
    includes: null,
    customisable: null,
    delivery_days: null,
    exclusive: false,
    template_id: null,
    status: 'draft',
    featured: false,
  };
}

/** What the editor saves, from what the API sent. */
export function toInput(item: PortfolioItem): PortfolioItemInput {
  return {
    kind: item.kind,
    title: item.title,
    slug: item.slug,
    summary: item.summary,
    body: item.body,
    sector: item.sector,
    tags: item.tags,
    demo_url: item.demo_url,
    images: item.images.map(({ url, alt }) => ({ url, alt })),
    client_name: item.client_name,
    client_permission: item.client_permission,
    price_cents: item.price_cents,
    currency: item.currency,
    includes: item.includes,
    customisable: item.customisable,
    delivery_days: item.delivery_days,
    exclusive: item.exclusive,
    template_id: item.template_id,
    status: item.status,
    featured: item.featured,
  };
}
