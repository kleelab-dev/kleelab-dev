import { ApiError, apiService } from '@/services/api';
import type { Site } from '@/types/api';

/** A name turned into something usable as a subdomain. */
export function slugifySiteName(value: string, fallback = 'my-site'): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

/**
 * Create a site, finding a free subdomain.
 *
 * The previous code derived a subdomain from the name and let the request fail
 * when it was taken — which, for a name like "cafe" or "studio", is most of the
 * time, and the customer saw "Subdomain already in use" on their first click. The
 * suffix search is not a courtesy; it is the difference between a name being
 * accepted and being rejected.
 *
 * Only a taken subdomain is retried. A plan limit or an unreachable API is the
 * caller's to report, and retrying those would just fail four times.
 */
export async function createSiteWithUniqueSubdomain(name: string): Promise<Site> {
  const base = slugifySiteName(name);
  const candidates = [base, `${base}-2`, `${base}-3`, `${base}-4`];

  let lastError: unknown = null;
  for (const subdomain of candidates) {
    try {
      return await apiService.createSite({ name, subdomain });
    } catch (reason) {
      lastError = reason;
      const isTaken =
        reason instanceof ApiError && /subdomain/i.test(reason.message);
      if (!isTaken) throw reason;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to create your site. Please try a different name.');
}
