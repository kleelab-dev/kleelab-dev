import type { PublicProduct } from '@/lib/publicApi';

/**
 * Cart arithmetic, kept pure so the same rules apply in the drawer, the button
 * badge and the checkout summary.
 */

export type CartLine = { productId: string; quantity: number };

/** Matches the server's per-line cap in `schemas/storefront.py`. */
export const MAX_LINE_QUANTITY = 99;

/**
 * Format an amount for display.
 *
 * Currency is always passed in. A price rendered with an assumed symbol is worse
 * than one rendered plainly, because it is confidently wrong.
 */
export function formatMoney(amount: number, currency: string, locale = 'en-GB'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    // Intl throws on an unrecognised ISO code; show the code rather than guess.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function clamp(quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity), 1), MAX_LINE_QUANTITY);
}

function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function addLine(lines: CartLine[], productId: string, quantity = 1): CartLine[] {
  if (!lines.some((line) => line.productId === productId)) {
    return [...lines, { productId, quantity: clamp(quantity) }];
  }
  return lines.map((line) =>
    line.productId === productId ? { ...line, quantity: clamp(line.quantity + quantity) } : line,
  );
}

export function setLineQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.productId !== productId);
  return lines.map((line) =>
    line.productId === productId ? { ...line, quantity: clamp(quantity) } : line,
  );
}

export function removeLine(lines: CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export type ResolvedCart = {
  items: { product: PublicProduct; quantity: number; lineTotal: number }[];
  total: number;
  /** Lines dropped because the product disappeared from the catalogue. */
  dropped: number;
};

/**
 * Join the cart against the live catalogue.
 *
 * A product can be withdrawn or deleted between adding it and checking out, so
 * lines that no longer resolve are dropped and counted rather than rendered as
 * broken rows. The server validates independently - this is for display.
 */
export function resolveCart(lines: CartLine[], products: PublicProduct[]): ResolvedCart {
  const byId = new Map(products.map((product) => [product.id, product]));
  const items: ResolvedCart['items'] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) continue;
    items.push({
      product,
      quantity: line.quantity,
      lineTotal: round(product.price * line.quantity),
    });
  }

  return {
    items,
    total: round(items.reduce((sum, item) => sum + item.lineTotal, 0)),
    dropped: lines.length - items.length,
  };
}

/** Trust nothing from storage: a hand-edited cart must not break the page. */
export function sanitizeLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { productId, quantity } = entry as Record<string, unknown>;
    if (typeof productId !== 'string' || !productId) return [];
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ productId, quantity: clamp(quantity) }];
  });
}
