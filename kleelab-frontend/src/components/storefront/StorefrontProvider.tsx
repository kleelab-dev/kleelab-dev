'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PublicProduct } from '@/lib/publicApi';

/**
 * Catalogue data for the nodes that need it.
 *
 * A context rather than props, because the storefront nodes live inside the
 * document tree and are rendered by the same registry the editor uses. Absent
 * provider means "editor", where the nodes show a placeholder - the editor and
 * the published site still run the identical component.
 */
export type Storefront = {
  subdomain: string;
  currency: string;
  /** `null` means the catalogue could not be loaded, which is not the same as empty. */
  products: PublicProduct[] | null;
};

const StorefrontContext = createContext<Storefront | null>(null);

export function StorefrontProvider({
  value,
  children,
}: {
  value: Storefront;
  children: ReactNode;
}) {
  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront(): Storefront | null {
  return useContext(StorefrontContext);
}
