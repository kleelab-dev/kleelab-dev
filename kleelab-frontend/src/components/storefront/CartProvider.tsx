'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  addLine,
  cartCount,
  removeLine,
  sanitizeLines,
  setLineQuantity,
  type CartLine,
} from '@/lib/storefront';

/**
 * Cart state for a published site.
 *
 * Kept in the browser because a shopper has no account - the whole point of a
 * storefront is that a stranger can buy. Scoped per subdomain so two different
 * shops open in one browser do not share a basket.
 */
type Cart = {
  lines: CartLine[];
  count: number;
  isOpen: boolean;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
};

const CartContext = createContext<Cart | null>(null);

function storageKeyFor(subdomain: string): string {
  return `kleelab_cart_${subdomain}`;
}

function readStored(key: string): CartLine[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? sanitizeLines(JSON.parse(raw)) : [];
  } catch {
    // Corrupt or unavailable storage starts an empty cart rather than a crash.
    return [];
  }
}

export function CartProvider({
  subdomain,
  children,
}: {
  subdomain: string;
  children: ReactNode;
}) {
  const storageKey = storageKeyFor(subdomain);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Restore after mount: localStorage does not exist during server rendering.
  // Deferred so the effect body does not call setState synchronously.
  useEffect(() => {
    const stored = readStored(storageKey);
    if (stored.length) Promise.resolve().then(() => setLines(stored));
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      // Private mode or a full quota: the cart still works for this page view.
    }
  }, [lines, storageKey]);

  const add = useCallback((productId: string, quantity = 1) => {
    setLines((current) => addLine(current, productId, quantity));
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((current) => setLineQuantity(current, productId, quantity));
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((current) => removeLine(current, productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<Cart>(
    () => ({
      lines,
      count: cartCount(lines),
      isOpen,
      add,
      setQuantity,
      remove,
      clear,
      open,
      close,
    }),
    [lines, isOpen, add, setQuantity, remove, clear, open, close],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Cart | null {
  return useContext(CartContext);
}
