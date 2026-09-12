'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useCart } from '@/components/storefront/CartProvider';
import { useStorefront } from '@/components/storefront/StorefrontProvider';
import { formatMoney, resolveCart, MAX_LINE_QUANTITY } from '@/lib/storefront';
import type { PublicOrder } from '@/types/api';

type Stage = 'cart' | 'checkout' | 'done';

const FIELD =
  'mt-2 w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-muted/70 focus:border-ink focus:outline-none';
const LABEL = 'block text-xs font-medium text-muted';

/**
 * Basket and checkout for a published site.
 *
 * Rendered by the page rather than by a document node: a drawer is page chrome,
 * not content someone should be able to delete from their layout.
 */
export function CartDrawer() {
  const cart = useCart();
  const storefront = useStorefront();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('cart');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const isOpen = cart?.isOpen ?? false;

  // Move focus into the dialog when it opens, or a keyboard user is left behind it.
  useEffect(() => {
    if (isOpen) Promise.resolve().then(() => closeRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cart?.close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, cart]);

  if (!cart || !storefront) return null;
  if (!isOpen) return null;

  const resolved = resolveCart(cart.lines, storefront.products ?? []);

  const close = () => {
    cart.close();
    setStage('cart');
    setError(null);
  };

  async function placeOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPlacing(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/public/sites/${encodeURIComponent(storefront!.subdomain)}/orders`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_email: data.get('customer_email'),
            customer_name: data.get('customer_name') || null,
            note: data.get('note') || null,
            items: cart!.lines.map((line) => ({
              product_id: line.productId,
              quantity: line.quantity,
            })),
          }),
        },
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        // FastAPI returns a list for validation failures, which is not worth showing.
        const detail = payload?.detail;
        throw new Error(
          typeof detail === 'string'
            ? detail
            : 'That order did not go through. Please try again.',
        );
      }

      setOrder(payload as PublicOrder);
      cart!.clear();
      setStage('done');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That order did not go through.');
      // The catalogue is probably stale - a sold-out item cannot be fixed by
      // retrying, so pull fresh stock and prices before they try again.
      router.refresh();
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close cart"
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-serif text-xl">
            {stage === 'done' ? 'Order placed' : stage === 'checkout' ? 'Checkout' : 'Your cart'}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close cart"
            className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {stage === 'done' && order ? (
            <div className="space-y-5">
              <p className="text-sm leading-6 text-muted">
                Thanks — your order is with the shop. The reference is{' '}
                <strong className="font-mono text-xs text-ink">{order.id.slice(0, 8)}</strong>,
                and a confirmation has been sent.
              </p>
              <ul className="divide-y divide-line border-y border-line">
                {order.items.map((line) => (
                  <li key={line.product_id} className="flex justify-between gap-4 py-3 text-sm">
                    <span>
                      {line.name}
                      <span className="text-muted"> × {line.quantity}</span>
                    </span>
                    <span className="shrink-0">
                      {formatMoney(line.line_total, order.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">Total</span>
                <span className="font-serif text-2xl">
                  {formatMoney(order.total, order.currency)}
                </span>
              </div>
              <p className="text-xs leading-5 text-muted">
                The shop has been told. They will be in touch about delivery.
              </p>
            </div>
          ) : cart.lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Your cart is empty. Add something from the shop and it will appear here.
            </p>
          ) : resolved.items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              The items in your cart are no longer available.
            </p>
          ) : (
            <div className="space-y-5">
              {resolved.dropped > 0 && (
                <p className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-2.5 text-xs text-danger">
                  {resolved.dropped} item{resolved.dropped === 1 ? '' : 's'} in your cart{' '}
                  {resolved.dropped === 1 ? 'is' : 'are'} no longer available and{' '}
                  {resolved.dropped === 1 ? 'was' : 'were'} removed.
                </p>
              )}

              <ul className="divide-y divide-line border-y border-line">
                {resolved.items.map(({ product, quantity, lineTotal }) => (
                  <li key={product.id} className="flex gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatMoney(product.price, storefront.currency)} each
                      </p>

                      <div className="mt-2.5 flex items-center gap-3">
                        <label className="sr-only" htmlFor={`qty-${product.id}`}>
                          Quantity of {product.name}
                        </label>
                        <input
                          id={`qty-${product.id}`}
                          type="number"
                          min={1}
                          max={MAX_LINE_QUANTITY}
                          value={quantity}
                          onChange={(event) =>
                            cart.setQuantity(product.id, Number(event.target.value))
                          }
                          className="w-16 rounded-lg border border-line bg-white px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => cart.remove(product.id)}
                          className="text-xs text-muted underline underline-offset-2 hover:text-accent"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm">
                      {formatMoney(lineTotal, storefront.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              {stage === 'checkout' && (
                <form id="checkout-form" onSubmit={placeOrder} className="space-y-4 border-t border-line pt-5">
                  <p className="text-xs leading-5 text-muted">
                    No account needed. We pass your details to the shop so they can fulfil the
                    order.
                  </p>
                  <div>
                    <label htmlFor="customer_email" className={LABEL}>
                      Email <span className="text-accent">*</span>
                    </label>
                    <input
                      id="customer_email"
                      name="customer_email"
                      type="email"
                      required
                      autoComplete="email"
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label htmlFor="customer_name" className={LABEL}>
                      Name
                    </label>
                    <input
                      id="customer_name"
                      name="customer_name"
                      type="text"
                      autoComplete="name"
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label htmlFor="note" className={LABEL}>
                      Anything they should know?
                    </label>
                    <textarea id="note" name="note" rows={3} className={FIELD} />
                  </div>
                  {error && (
                    <p
                      role="alert"
                      className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
                    >
                      {error}
                    </p>
                  )}
                </form>
              )}

              {stage === 'cart' && error && (
                <p
                  role="alert"
                  className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
                >
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {stage !== 'done' && cart.lines.length > 0 && (
          <footer className="border-t border-line px-5 py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Subtotal</span>
              <span className="font-serif text-2xl">
                {formatMoney(resolved.total, storefront.currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Delivery and taxes are arranged with the shop.
            </p>
            {stage === 'cart' ? (
              <button
                type="button"
                disabled={resolved.items.length === 0}
                onClick={() => setStage('checkout')}
                className="mt-4 w-full rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:opacity-50"
              >
                Checkout
              </button>
            ) : (
              <button
                type="submit"
                form="checkout-form"
                disabled={placing}
                className="mt-4 w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
              >
                {placing ? 'Placing order…' : 'Place order'}
              </button>
            )}
          </footer>
        )}

        {stage === 'done' && (
          <footer className="border-t border-line px-5 py-4">
            <button
              type="button"
              onClick={close}
              className="w-full rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper hover:bg-ink-soft"
            >
              Continue shopping
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
