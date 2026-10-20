import type {
  AttentionItem,
  ChatReply,
  ChatTurn,
  InvoiceCreateInput,
  InvoicePatchInput,
  Lead,
  LeadStatus,
  ProjectCreateInput,
  ProjectDetail,
  ProjectPatchInput,
  ProjectSummary,
  RequestKind,
  RequestStatus,
  StaffMember,
  StagePatchInput,
  StaffUpdateInput,
  User,
} from '@/types/api';

/**
 * A failed API call, with the server's error code preserved.
 *
 * The backend answers refusals with `{"error": {"code": ..., "message": ...,
 * "details": ...}}`. Collapsing that into a plain message loses the distinction
 * between "you have already answered this" and "something went wrong" — and the
 * interface needs that distinction to decide what to offer next. A sentence cannot be reliably pattern-matched for this.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    message: string,
    status: number,
    code = 'http_error',
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

}

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
    const errorCode: string = payload?.error?.code ?? 'http_error';
    const details: Record<string, unknown> | undefined = payload?.error?.details;
    const message =
      payload?.error?.message ??
      payload?.detail ??
      payload?.message ??
      (response.status === 429
        ? 'Too many attempts. Please wait a moment and try again.'
        : `Request failed (${response.status})`);
    throw new ApiError(
      typeof message === 'string' ? message : `Request failed (${response.status})`,
      response.status,
      errorCode,
      details,
    );
  }

  // 204 or an empty body must not be parsed as JSON.
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export const apiService = {
  // --- Accounts ------------------------------------------------------------

  async register(data: { email: string; password: string; full_name: string }): Promise<User> {
    return post<User>('/api/auth/register', data);
  },

  async login(email: string, password: string): Promise<void> {
    const result = await post<{ access_token: string; refresh_token?: string }>('/api/auth/login', { email, password });
    setSession(result.access_token, result.refresh_token ?? null);
  },

  /** Revoke the session server-side, then clear it locally. */
  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: JSON_HEADERS,
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

  async verifyEmail(token: string): Promise<void> {
    return request<void>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { method: 'POST' });
  },

  /** Always answers the same way, so it cannot be used to find out who has an account. */
  async requestPasswordReset(email: string): Promise<void> {
    await request<unknown>(`/api/auth/request-password-reset?email=${encodeURIComponent(email)}`, { method: 'POST' });
  },

  /** Used both by "forgot password" and by the invite a new client receives. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await post<unknown>('/api/auth/reset-password', { token, new_password: newPassword });
  },

  // --- Public enquiries ----------------------------------------------------

  async chat(messages: ChatTurn[], page?: string): Promise<ChatReply> {
    return post<ChatReply>('/api/chat', { messages, page });
  },

  /**
   * Send an enquiry to the team. `source` tells the inbox whether it came from
   * the contact page or from the chat.
   */
  async submitLead(payload: {
    email: string;
    name?: string | null;
    company?: string | null;
    /** A band from `budgets` in content/site, or `ngn_<amount>` for a typed figure. */
    budget?: string;
    message: string;
    project_type?: string | null;
    source?: 'marketing' | 'chat';
    website?: string;
  }): Promise<{ status: string }> {
    return post<{ status: string }>('/api/agency/leads', { source: 'marketing', ...payload });
  },

  // --- Client dashboard ----------------------------------------------------

  async getProjects(): Promise<ProjectSummary[]> {
    return request<ProjectSummary[]>('/api/projects');
  },

  /** Clients see their own projects; the team can open any of them. */
  async getProject(projectId: string): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/api/projects/${projectId}`);
  },

  async sendMessage(projectId: string, body: string): Promise<ProjectDetail> {
    return post<ProjectDetail>(`/api/projects/${projectId}/messages`, { body });
  },

  async answerApproval(
    projectId: string,
    updateId: string,
    decision: 'approved' | 'changes_requested',
    note?: string,
  ): Promise<ProjectDetail> {
    return post<ProjectDetail>(`/api/projects/${projectId}/approvals/${updateId}`, { decision, note: note || null });
  },

  async requestService(projectId: string, kind: RequestKind, message?: string): Promise<ProjectDetail> {
    return post<ProjectDetail>(`/api/projects/${projectId}/requests`, { kind, message: message || null });
  },

  /**
   * Share one file on a project. The body is the file itself, not a form: the
   * server reads the name from X-File-Name and stops reading past 10 MB.
   */
  async uploadFile(projectId: string, file: File): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    });
  },

  async deleteFile(projectId: string, fileId: string): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/api/projects/${projectId}/files/${fileId}`, { method: 'DELETE' });
  },

  /**
   * Download a shared file. A plain link cannot carry the sign-in token, so the
   * file is fetched here and handed to the browser to save.
   */
  async downloadFile(projectId: string, fileId: string, filename: string): Promise<void> {
    const path = `/api/projects/${projectId}/files/${fileId}`;
    let response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
    if (response.status === 401 && (await refreshSession())) {
      response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
    }
    if (!response.ok) throw new ApiError('That file could not be downloaded.', response.status);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // --- Team admin ----------------------------------------------------------

  async adminStaff(): Promise<StaffMember[]> {
    return request<StaffMember[]>('/api/admin/staff');
  },

  async adminOverview(): Promise<AttentionItem[]> {
    return request<AttentionItem[]>('/api/admin/overview');
  },

  async adminProjects(): Promise<ProjectSummary[]> {
    return request<ProjectSummary[]>('/api/admin/projects');
  },

  async adminCreateProject(input: ProjectCreateInput): Promise<{ project: ProjectDetail; invited: boolean }> {
    return post<{ project: ProjectDetail; invited: boolean }>('/api/admin/projects', input);
  },

  async adminUpdateProject(projectId: string, input: ProjectPatchInput): Promise<ProjectDetail> {
    return patch<ProjectDetail>(`/api/admin/projects/${projectId}`, input);
  },

  /** Email the client a fresh sign-in link. */
  async adminResendInvite(projectId: string): Promise<{ status: string; email: string }> {
    return post<{ status: string; email: string }>(`/api/admin/projects/${projectId}/invite`);
  },

  async adminAddStage(projectId: string, name: string, description?: string | null): Promise<ProjectDetail> {
    return post<ProjectDetail>(`/api/admin/projects/${projectId}/stages`, { name, description: description || null });
  },

  async adminUpdateStage(projectId: string, stageId: string, input: StagePatchInput): Promise<ProjectDetail> {
    return patch<ProjectDetail>(`/api/admin/projects/${projectId}/stages/${stageId}`, input);
  },

  async adminMoveStage(projectId: string, stageId: string, direction: 'up' | 'down'): Promise<ProjectDetail> {
    return post<ProjectDetail>(`/api/admin/projects/${projectId}/stages/${stageId}/move`, { direction });
  },

  async adminDeleteStage(projectId: string, stageId: string): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/api/admin/projects/${projectId}/stages/${stageId}`, { method: 'DELETE' });
  },

  async adminPostUpdate(projectId: string, input: StaffUpdateInput): Promise<ProjectDetail> {
    return post<ProjectDetail>(`/api/admin/projects/${projectId}/updates`, input);
  },

  async adminUpdateRequest(projectId: string, requestId: string, status: RequestStatus): Promise<ProjectDetail> {
    return patch<ProjectDetail>(`/api/admin/projects/${projectId}/requests/${requestId}`, { status });
  },

  async adminCreateInvoice(projectId: string, input: InvoiceCreateInput): Promise<ProjectDetail> {
    return post<ProjectDetail>(`/api/admin/projects/${projectId}/invoices`, input);
  },

  async adminUpdateInvoice(projectId: string, invoiceId: string, input: InvoicePatchInput): Promise<ProjectDetail> {
    return patch<ProjectDetail>(`/api/admin/projects/${projectId}/invoices/${invoiceId}`, input);
  },

  async adminLeads(): Promise<Lead[]> {
    return request<Lead[]>('/api/admin/leads');
  },

  async adminUpdateLead(leadId: string, status: LeadStatus): Promise<Lead> {
    return patch<Lead>(`/api/admin/leads/${leadId}`, { status });
  },
};
