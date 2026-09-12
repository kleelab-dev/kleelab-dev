'use client';

import { BlockPlaceholder } from '@/components/storefront/Placeholder';
import { useCart } from '@/components/storefront/CartProvider';
import { useStorefront } from '@/components/storefront/StorefrontProvider';
import { formatMoney } from '@/lib/storefront';

/* eslint-disable @next/next/no-img-element -- product images are owner-supplied
   URLs from the media library, which can live on any configured host. */

const COLUMN_CLASSES: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

/**
 * Renders this site's catalogue.
 *
 * Degrades to a placeholder in the editor, where there is no catalogue to show
 * and no cart to add to.
 */
export function ProductGrid({
  columns = 3,
  showPrices = true,
}: {
  columns?: number;
  showPrices?: boolean;
}) {
  const storefront = useStorefront();
  const cart = useCart();

  if (!storefront) {
    return (
      <BlockPlaceholder
        label="Products"
        hint="Shows what this site has for sale, taken from its shop catalogue."
      />
    );
  }

  if (storefront.products === null) {
    return (
      <p className="rounded-lg border border-[var(--kl-line)] bg-[var(--kl-canvas)] px-4 py-8 text-center text-sm text-[var(--kl-muted)]">
        Products are unavailable at the moment. Please try again shortly.
      </p>
    );
  }

  if (storefront.products.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--kl-line)] bg-[var(--kl-canvas)] px-4 py-8 text-center text-sm text-[var(--kl-muted)]">
        Nothing is for sale yet.
      </p>
    );
  }

  const columnClass = COLUMN_CLASSES[Math.min(Math.max(columns, 1), 4)] ?? 'md:grid-cols-3';

  return (
    <ul className={`grid grid-cols-1 gap-6 ${columnClass}`}>
      {storefront.products.map((product) => (
        <li
          key={product.id}
          className="flex flex-col overflow-hidden rounded-xl border border-[var(--kl-line)] bg-[var(--kl-surface)]"
        >
          {product.images[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              className="aspect-[4/3] w-full object-cover"
            />
          ) : (
            <div aria-hidden="true" className="aspect-[4/3] w-full bg-[var(--kl-canvas)]" />
          )}

          <div className="flex flex-1 flex-col p-4">
            <h3 className="font-serif text-lg leading-snug">{product.name}</h3>
            {product.description && (
              <p className="mt-1.5 text-sm leading-6 text-[var(--kl-muted)]">
                {product.description}
              </p>
            )}

            <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--kl-line)] pt-4">
              {showPrices && (
                <span className="text-sm font-medium">
                  {formatMoney(product.price, storefront.currency)}
                </span>
              )}
              <button
                type="button"
                disabled={!product.in_stock}
                onClick={() => cart?.add(product.id)}
                className="rounded-full px-3.5 py-2 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: 'var(--kl-accent)', color: 'var(--kl-paper)' }}
              >
                {product.in_stock ? 'Add to cart' : 'Sold out'}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
