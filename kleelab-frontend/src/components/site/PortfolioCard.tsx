import { clsx } from 'clsx';
import { PortfolioImage } from '@/components/site/PortfolioImage';
import Link from 'next/link';
import { formatPrice, type PortfolioItem } from '@/lib/portfolio';

/**
 * One item in the portfolio grid: the cover screenshot, its name and the price or client.
 * Compact is for the homepage slider: a narrower image and a two-line summary.
 */
export function PortfolioCard({
  item,
  priority = false,
  compact = false,
}: {
  item: PortfolioItem;
  priority?: boolean;
  compact?: boolean;
}) {
  const cover = item.images[0];
  return (
    <article className="card card-lift relative flex h-full flex-col overflow-hidden">
      <Link href={`/portfolio/${item.slug}`} className="block border-b-[1.5px] border-ink bg-paper" tabIndex={-1} aria-hidden>
        <div className="relative aspect-[16/10]">
          {cover && (
            <PortfolioImage
              src={cover.url}
              alt=""
              fill
              sizes={compact ? '(min-width: 1024px) 400px, (min-width: 640px) 50vw, 85vw' : '(min-width: 768px) 50vw, 100vw'}
              className="object-cover object-top"
              priority={priority}
            />
          )}
        </div>
      </Link>
      {item.sold && <span className="stamp absolute right-5 top-5 bg-white">Sold</span>}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-label text-muted">
          <span className="text-cobalt">{item.kind === 'for_sale' ? 'Ready-made' : 'We built'}</span>
          {item.sector && <span className="rounded-full border border-line px-2 py-0.5">{item.sector}</span>}
        </div>
        <h3 className="mt-3 font-display text-2xl font-extrabold tracking-tight">
          <Link href={`/portfolio/${item.slug}`} className="after:absolute after:inset-0">
            {item.title}
          </Link>
        </h3>
        <p className={clsx('mt-2 flex-1 leading-relaxed text-muted', compact && 'line-clamp-2 text-sm')}>{item.summary}</p>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-label text-ink">
          {item.kind === 'for_sale'
            ? item.price_cents
              ? `From ${formatPrice(item.price_cents, item.currency)}${item.delivery_days ? ` · ready in ${item.delivery_days} days` : ''}`
              : 'No longer available'
            : item.client_name ?? 'Client project'}
        </p>
      </div>
    </article>
  );
}
