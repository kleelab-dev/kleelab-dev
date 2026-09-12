import { BuilderBlock, Page, Site, Template, User } from '@/types/api';

// Preferred path: leave this empty so requests go to the relative /api/* routes
// and Next.js proxies them to the backend (see `rewrites` in next.config.mjs).
// Set NEXT_PUBLIC_API_URL only when the browser must call the API cross-origin.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

const TOKEN_KEY = 'kleelab_access_token';

function authHeaders(): HeadersInit {
  const token = typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) },
    });
  } catch {
    throw new Error('Cannot reach the KleeLab API. Make sure the backend is running and API_URL is set correctly.');
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
    const result = await request<{ access_token: string }>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    window.localStorage.setItem(TOKEN_KEY, result.access_token);
  },

  logout(): void {
    clearToken();
  },

  async getCurrentUser(): Promise<User> {
    return request<User>('/api/auth/me');
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

  async getPages(siteId: string): Promise<Page[]> {
    const pages = await request<Record<string, unknown>[]>(`/api/sites/${siteId}/pages`);
    return pages.map(normalizePage);
  },

  async createPage(siteId: string, pageData: Partial<Page>): Promise<Page> {
    const page = await request<Record<string, unknown>>(`/api/sites/${siteId}/pages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pageData, content: pageData.content_json || {} }) });
    return normalizePage(page);
  },

  async updatePage(siteId: string, pageId: string, pageData: Partial<Page>): Promise<Page> {
    const page = await request<Record<string, unknown>>(`/api/sites/${siteId}/pages/${pageId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pageData, content: pageData.content_json || {} }) });
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
};