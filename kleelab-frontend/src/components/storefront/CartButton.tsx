'use client';

import { ShoppingBagIcon } from '@heroicons/react/24/outline';
import { BlockPlaceholder } from '@/components/storefront/Placeholder';
import { useCart } from '@/components/storefront/CartProvider';
import { useStorefront } from '@/components/storefront/StorefrontProvider';

/** Opens the cart. Shows the running item count so the state is never hidden. */
export function CartButton({ label = 'Cart' }: { label?: string }) {
  const storefront = useStorefront();
  const cart = useCart();

  if (!storefront || !cart) {
    return <BlockPlaceholder label="Cart" hint="A basket button with a running item count." />;
  }

  return (
    <button
      type="button"
      onClick={cart.open}
      className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink"
    >
      <ShoppingBagIcon className="h-4 w-4" />
      {label}
      {cart.count > 0 && (
        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
          {cart.count}
        </span>
      )}
      <span className="sr-only">
        {cart.count === 0 ? 'is empty' : `contains ${cart.count} item${cart.count === 1 ? '' : 's'}`}
      </span>
    </button>
  );
}
