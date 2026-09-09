import { BuilderBlock, Page, Site, Template, User } from '@/types/api';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const API_BASE_URL = (configuredApiUrl || 'http://localhost:8000').replace(/\/$/, '');

function validateApiUrl(): void {
  try {
    const url = new URL(API_BASE_URL);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_API_URL: "${API_BASE_URL}". Use a full URL such as https://kleelab-dev.onrender.com.`);
  }
}

function authHeaders(): HeadersInit {
  const token = typeof window === 'undefined' ? null : window.localStorage.getItem('kleelab_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  validateApiUrl();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) },
    });
  } catch {
    throw new Error(`Cannot reach the KleeLab API at ${API_BASE_URL}. Check NEXT_PUBLIC_API_URL and the backend deployment.`);
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
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
    window.localStorage.setItem('kleelab_access_token', result.access_token);
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

  async publishSite(siteId: string): Promise<Site> {
    return request<Site>(`/api/sites/${siteId}/publish`, { method: 'POST' });
  },

  async savePage(siteId: string, pageId: string, blocks: BuilderBlock[]): Promise<Page> {
    return this.updatePage(siteId, pageId, { content_json: { version: 1, blocks } });
  },
};