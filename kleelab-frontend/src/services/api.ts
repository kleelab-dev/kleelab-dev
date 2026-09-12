import {
  ActivityEvent,
  Asset,
  BuilderBlock,
  DashboardStats,
  Order,
  OrderSeries,
  OrderStatus,
  Page,
  Product,
  ProductInput,
  Site,
  Template,
  User,
} from '@/types/api';

// Preferred path: leave this empty so requests go to the relative /api/* routes
// and Next.js proxies them to the backend (see `rewrites` in next.config.mjs).
// Set NEXT_PUBLIC_API_URL only when the browser must call the API cross-origin.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

const TOKEN_KEY = 'kleelab_access_token';
const REFRESH_KEY = 'kleelab_refresh_token';

/**
 * Endpoints that must never trigger a token refresh.
 *
 * Excluding every `/api/auth/*` path looked tidy but broke the 15-minute access
 * token: `/api/auth/me` would return 401 and, instead of rotating, the dashboard
 * simply errored. Only the calls that establish or end a session are excluded
 * here, so refreshing cannot recurse into itself.
 */
const NO_REFRESH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
]);

function readStorage(key: string): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
}

function authHeaders(): HeadersInit {
  const token = readStorage(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getToken(): string | null {
  return readStorage(TOKEN_KEY);
}

/**
 * Whether a session is present in this browser.
 *
 * Presence only - it says nothing about whether the token is still valid, since
 * answering that needs a round trip. Used for decisions that must not cost one,
 * such as whether the header should offer "Sign in".
 */
export function hasSession(): boolean {
  return Boolean(readStorage(REFRESH_KEY) || readStorage(TOKEN_KEY));
}

function getRefreshToken(): string | null {
  return readStorage(REFRESH_KEY);
}

/** Persist a session. The refresh token is what lets the access token rotate. */
export function setSession(accessToken: string, refreshToken?: string | null): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

/** Single in-flight refresh, so parallel 401s do not each rotate the token. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) {
        clearToken();
        return false;
      }
      const data = (await response.json()) as { access_token: string; refresh_token?: string };
      setSession(data.access_token, data.refresh_token ?? refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) },
    });
  } catch {
    throw new Error('Cannot reach the KleeLab API. Make sure the backend is running and API_URL is set correctly.');
  }

  // A short-lived access token expiring is the normal case, not an error:
  // rotate once and replay the request.
  if (response.status === 401 && allowRefresh && !NO_REFRESH_PATHS.has(path)) {
    if (await refreshSession()) return request<T>(path, options, false);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload?.detail ??
      payload?.error?.message ??
      payload?.message ??
      (response.status === 429
        ? 'Too many attempts. Please wait a moment and try again.'
        : `Request failed (${response.status})`);
    throw new Error(typeof message === 'string' ? message : `Request failed (${response.status})`);
  }

  // 204 or an empty body must not be parsed as JSON.
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function normalizePage(page: Record<string, unknown>): Page {
  return { ...page, content_json: page.content || {} } as Page;
}

/**
 * Translate the frontend Page shape into the backend payload.
 *
 * `content` is only included when `content_json` was supplied — otherwise a
 * metadata-only update would overwrite the stored document with `{}`.
 */
function serializePagePayload(pageData: Partial<Page>, isCreate = false): Record<string, unknown> {
  const { content_json, ...rest } = pageData;
  const payload: Record<string, unknown> = { ...rest };
  if (content_json !== undefined || isCreate) {
    payload.content = content_json ?? {};
  }
  return payload;
}

function normalizeTemplate(template: Record<string, unknown>): Template {
  const config = (template.config || {}) as Record<string, unknown>;
  return {
    ...template,
    title: template.title || template.name,
    description: template.description || config.description || 'A flexible starting point for your next site.',
    thumbnail_url: template.thumbnail_url || template.thumbnail || template.preview_image || '',
  } as Template;
}

export const apiService = {
  async register(data: { email: string; password: string; full_name: string }): Promise<User> {
    return request<User>('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  },

  async login(email: string, password: string): Promise<void> {
    const result = await request<{ access_token: string; refresh_token?: string }>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    setSession(result.access_token, result.refresh_token ?? null);
  },

  /** Revoke the session server-side, then clear it locally. */
  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      }
    } catch {
      // Signing out locally must succeed even when the API is unreachable.
    }
    clearToken();
  },

  async getCurrentUser(): Promise<User> {
    return request<User>('/api/auth/me');
  },

  /** Exchange an emailed verification link token for a verified account. */
  async verifyEmail(token: string): Promise<void> {
    return request<void>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    });
  },

  /**
   * Ask for a fresh verification link.
   *
   * `delivered` is false when no email provider is configured, in which case the
   * backend writes the link to its log rather than pretending it was sent.
   */
  async resendVerification(): Promise<{ status: string; delivered: boolean }> {
    return request<{ status: string; delivered: boolean }>('/api/auth/resend-verification', {
      method: 'POST',
    });
  },

  async getTemplates(): Promise<Template[]> {
    const templates = await request<Record<string, unknown>[]>('/api/templates');
    return templates.map(normalizeTemplate);
  },

  async getSites(): Promise<Site[]> {
    return request<Site[]>('/api/sites');
  },

  async getSite(siteId: string): Promise<Site> {
    return request<Site>(`/api/sites/${siteId}`);
  },

  async createSite(data: Partial<Site>): Promise<Site> {
    return request<Site>('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  },

  async updateSite(siteId: string, data: Partial<Site>): Promise<Site> {
    return request<Site>(`/api/sites/${siteId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  },

  async deleteSite(siteId: string): Promise<void> {
    return request<void>(`/api/sites/${siteId}`, { method: 'DELETE' });
  },

  async unpublishSite(siteId: string): Promise<void> {
    return request<void>(`/api/sites/${siteId}/unpublish`, { method: 'POST' });
  },

  async getPages(siteId: string): Promise<Page[]> {
    const pages = await request<Record<string, unknown>[]>(`/api/sites/${siteId}/pages`);
    return pages.map(normalizePage);
  },

  async createPage(siteId: string, pageData: Partial<Page>): Promise<Page> {
    const page = await request<Record<string, unknown>>(`/api/sites/${siteId}/pages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serializePagePayload(pageData, true)) });
    return normalizePage(page);
  },

  async updatePage(siteId: string, pageId: string, pageData: Partial<Page>): Promise<Page> {
    const page = await request<Record<string, unknown>>(`/api/sites/${siteId}/pages/${pageId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serializePagePayload(pageData)) });
    return normalizePage(page);
  },

  /** Update SEO metadata without touching page content. */
  async updatePageSeo(
    siteId: string,
    pageId: string,
    seo: { meta_title?: string; meta_description?: string },
  ): Promise<Page> {
    const page = await request<Record<string, unknown>>(`/api/sites/${siteId}/pages/${pageId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(seo) });
    return normalizePage(page);
  },

  async publishSite(siteId: string): Promise<{ message: string; url: string }> {
    return request<{ message: string; url: string }>(`/api/sites/${siteId}/publish`, { method: 'POST' });
  },

  async savePage(siteId: string, pageId: string, blocks: BuilderBlock[]): Promise<Page> {
    return this.updatePage(siteId, pageId, { content_json: { version: 1, blocks } });
  },

  /** Persist a canonical document as the page content. */
  async saveDocument(
    siteId: string,
    pageId: string,
    document: unknown,
    meta: Partial<Pick<Page, 'title' | 'seo_title' | 'seo_description'>> = {},
  ): Promise<Page> {
    return this.updatePage(siteId, pageId, { content_json: { document }, ...meta });
  },

  async getAssets(siteId: string): Promise<Asset[]> {
    return request<Asset[]>(`/api/sites/${siteId}/assets`);
  },

  /** Upload an image (as a base64 data URL) and return the stored asset. */
  async uploadAsset(siteId: string, payload: { filename: string; data: string }): Promise<Asset> {
    return request<Asset>(`/api/sites/${siteId}/assets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  },

  async deleteAsset(siteId: string, assetId: string): Promise<void> {
    return request<void>(`/api/sites/${siteId}/assets/${assetId}`, { method: 'DELETE' });
  },

  // ---- Dashboard -------------------------------------------------------

  async getDashboardStats(): Promise<DashboardStats> {
    return request<DashboardStats>('/api/dashboard/stats');
  },

  async getRecentActivity(): Promise<ActivityEvent[]> {
    return request<ActivityEvent[]>('/api/dashboard/recent-activity');
  },

  async getOrderSeries(): Promise<OrderSeries> {
    return request<OrderSeries>('/api/dashboard/chart-data');
  },

  // ---- Products --------------------------------------------------------

  async getProducts(siteId: string): Promise<Product[]> {
    return request<Product[]>(`/api/sites/${siteId}/products`);
  },

  async createProduct(siteId: string, data: ProductInput): Promise<Product> {
    return request<Product>(`/api/sites/${siteId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async updateProduct(siteId: string, productId: string, data: Partial<ProductInput>): Promise<Product> {
    return request<Product>(`/api/sites/${siteId}/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async deleteProduct(siteId: string, productId: string): Promise<void> {
    return request<void>(`/api/sites/${siteId}/products/${productId}`, { method: 'DELETE' });
  },

  // ---- Orders ----------------------------------------------------------

  async getOrders(siteId: string): Promise<Order[]> {
    return request<Order[]>(`/api/sites/${siteId}/orders`);
  },

  async updateOrderStatus(siteId: string, orderId: string, status: OrderStatus): Promise<Order> {
    return request<Order>(`/api/sites/${siteId}/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  },
};