import type {
  ActivityPage,
  AlertList,
  AdminInvoice,
  AdminStats,
  AttentionItem,
  ChatReply,
  ChatTurn,
  ClientDetail,
  ClientPatchInput,
  ClientSummary,
  InvoiceCreateInput,
  InvoicePatchInput,
  Lead,
  LeadDetail,
  LeadPatchInput,
  ProjectCreateInput,
  ProjectDetail,
  ProjectFile,
  ProjectPatchInput,
  ProjectSummary,
  ProposalDetail,
  ProposalInput,
  RequestKind,
  RequestStatus,
  SearchResults,
  StaffMember,
  StagePatchInput,
  StaffUpdateInput,
  TeamMember,
  TwoStepChallenge,
  TwoStepSetup,
  TwoStepStatus,
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
  '/api/auth/staff-login',
  '/api/auth/staff-login/two-step',
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

/** Fetch a signed-in download and hand it to the browser to save. */
async function saveDownload(path: string, filename: string, failure: string): Promise<void> {
  let response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
  if (response.status === 401 && (await refreshSession())) {
    response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
  }
  if (!response.ok) throw new ApiError(failure, response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const apiService = {
  // --- Accounts ------------------------------------------------------------

  async register(data: { email: string; password: string; full_name: string }): Promise<User> {
    return post<User>('/api/auth/register', data);
  },

  /**
   * Staff-only sign-in: the backend refuses client accounts here, and staff on the public site's /login.
   * With two-step on, the right password returns a challenge instead of a session; finish with `loginWithCode`.
   */
  async login(email: string, password: string): Promise<TwoStepChallenge | null> {
    const result = await post<{ access_token: string; refresh_token?: string } | TwoStepChallenge>('/api/auth/staff-login', { email, password });
    if ('two_step_required' in result) return result;
    setSession(result.access_token, result.refresh_token ?? null);
    return null;
  },

  /** A 6-digit code from the authenticator app, or one of the recovery codes. */
  async loginWithCode(challenge: string, code: string): Promise<void> {
    const result = await post<{ access_token: string; refresh_token?: string }>('/api/auth/staff-login/two-step', { challenge, code });
    setSession(result.access_token, result.refresh_token ?? null);
  },

  async twoStepStatus(): Promise<TwoStepStatus> {
    return request<TwoStepStatus>('/api/auth/two-step');
  },

  /** A new secret to scan. Nothing changes until `twoStepEnable` gets a code from it. */
  async twoStepSetup(password: string): Promise<TwoStepSetup> {
    return post<TwoStepSetup>('/api/auth/two-step/setup', { password });
  },

  /** Turns two-step on and returns the recovery codes, which are shown only this once. */
  async twoStepEnable(code: string): Promise<string[]> {
    return (await post<{ codes: string[] }>('/api/auth/two-step/enable', { code })).codes;
  },

  async twoStepDisable(password: string, code: string): Promise<TwoStepStatus> {
    return post<TwoStepStatus>('/api/auth/two-step/disable', { password, code });
  },

  /** Replaces every recovery code. Needs a code from the app, not a recovery code. */
  async newRecoveryCodes(code: string): Promise<string[]> {
    return (await post<{ codes: string[] }>('/api/auth/two-step/recovery-codes', { code })).codes;
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
    await post<unknown>('/api/auth/request-password-reset', { email });
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
   * Upload one file for an update that has not been posted yet. It stays hidden
   * until the update goes; pass its id in attachment_ids.
   */
  async uploadAttachment(projectId: string, file: File): Promise<ProjectFile> {
    return request<ProjectFile>(`/api/projects/${projectId}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    });
  },

  /** A signed-in file as a local object URL, for showing a picture. Revoke it when done. */
  async fileObjectUrl(projectId: string, fileId: string): Promise<string> {
    const path = `/api/projects/${projectId}/files/${fileId}`;
    let response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
    if (response.status === 401 && (await refreshSession())) {
      response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
    }
    if (!response.ok) throw new ApiError('That picture could not be loaded.', response.status);
    return URL.createObjectURL(await response.blob());
  },

  /**
   * Download a shared file. A plain link cannot carry the sign-in token, so the
   * file is fetched here and handed to the browser to save.
   */
  async downloadFile(projectId: string, fileId: string, filename: string): Promise<void> {
    return saveDownload(`/api/projects/${projectId}/files/${fileId}`, filename, 'That file could not be downloaded.');
  },

  /** The invoice as a KleeLab-branded PDF. */
  async downloadInvoicePdf(projectId: string, invoice: { id: string; number: string }): Promise<void> {
    return saveDownload(
      `/api/projects/${projectId}/invoices/${invoice.id}/pdf`,
      `KleeLab-${invoice.number}.pdf`,
      'The invoice could not be downloaded.',
    );
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

  async adminRemindInvoice(projectId: string, invoiceId: string): Promise<ProjectDetail> {
    return post<ProjectDetail>(`/api/admin/projects/${projectId}/invoices/${invoiceId}/remind`, {});
  },

  async adminLeads(): Promise<Lead[]> {
    return request<Lead[]>('/api/admin/leads');
  },

  async adminLead(leadId: string): Promise<LeadDetail> {
    return request<LeadDetail>(`/api/admin/leads/${leadId}`);
  },

  async adminUpdateLead(leadId: string, input: LeadPatchInput): Promise<Lead> {
    return patch<Lead>(`/api/admin/leads/${leadId}`, input);
  },

  /** A private team note on an enquiry. */
  async adminAddLeadNote(leadId: string, body: string): Promise<LeadDetail> {
    return post<LeadDetail>(`/api/admin/leads/${leadId}/notes`, { body });
  },

  /** Email the enquirer; the backend keeps a copy in the enquiry's history. */
  async adminReplyToLead(leadId: string, subject: string, body: string): Promise<LeadDetail> {
    return post<LeadDetail>(`/api/admin/leads/${leadId}/reply`, { subject, body });
  },

  // --- Proposals -----------------------------------------------------------

  /** A new draft for an enquiry, filled in from it with our usual steps and terms. */
  async adminCreateProposal(leadId: string, input: ProposalInput = {}): Promise<ProposalDetail> {
    return post<ProposalDetail>('/api/admin/proposals', { lead_id: leadId, ...input });
  },

  async adminProposal(proposalId: string): Promise<ProposalDetail> {
    return request<ProposalDetail>(`/api/admin/proposals/${proposalId}`);
  },

  async adminUpdateProposal(proposalId: string, input: ProposalInput): Promise<ProposalDetail> {
    return patch<ProposalDetail>(`/api/admin/proposals/${proposalId}`, input);
  },

  /** Emails the client their link. Nothing changes if the email fails. */
  async adminSendProposal(proposalId: string): Promise<ProposalDetail> {
    return post<ProposalDetail>(`/api/admin/proposals/${proposalId}/send`);
  },

  async adminWithdrawProposal(proposalId: string): Promise<ProposalDetail> {
    return post<ProposalDetail>(`/api/admin/proposals/${proposalId}/withdraw`);
  },

  /** A fresh draft with the same content, for a new version after a decline or expiry. */
  async adminCopyProposal(proposalId: string): Promise<ProposalDetail> {
    return post<ProposalDetail>(`/api/admin/proposals/${proposalId}/copy`);
  },

  async adminDeleteProposal(proposalId: string): Promise<void> {
    return request<void>(`/api/admin/proposals/${proposalId}`, { method: 'DELETE' });
  },

  async adminStats(): Promise<AdminStats> {
    return request<AdminStats>('/api/admin/stats');
  },

  /** Every invoice on every project, newest first. */
  async adminInvoices(): Promise<AdminInvoice[]> {
    return request<AdminInvoice[]>('/api/admin/invoices');
  },

  async adminClients(): Promise<ClientSummary[]> {
    return request<ClientSummary[]>('/api/admin/clients');
  },

  async adminClient(clientId: string): Promise<ClientDetail> {
    return request<ClientDetail>(`/api/admin/clients/${clientId}`);
  },

  /** Rename, or switch access off (signs them out everywhere) and back on. */
  async adminUpdateClient(clientId: string, input: ClientPatchInput): Promise<ClientDetail> {
    return patch<ClientDetail>(`/api/admin/clients/${clientId}`, input);
  },

  // --- Team, activity and search ---------------------------------------------

  async adminTeam(): Promise<TeamMember[]> {
    return request<TeamMember[]>('/api/admin/team');
  },

  /** Creates a staff account and emails a 7-day link to set a password. */
  async adminAddTeammate(email: string, fullName: string): Promise<{ member: TeamMember; invite_sent: boolean }> {
    return post<{ member: TeamMember; invite_sent: boolean }>('/api/admin/team', { email, full_name: fullName });
  },

  /** Rename, or switch someone off (signs them out everywhere) and back on. */
  async adminUpdateTeammate(memberId: string, input: { full_name?: string; is_active?: boolean }): Promise<TeamMember> {
    return patch<TeamMember>(`/api/admin/team/${memberId}`, input);
  },

  async adminInviteTeammate(memberId: string): Promise<{ status: string; email: string }> {
    return post<{ status: string; email: string }>(`/api/admin/team/${memberId}/invite`);
  },

  /** For a teammate who lost their phone: they sign in with a password alone and set it up again. */
  async adminResetTwoStep(memberId: string): Promise<TeamMember> {
    return post<TeamMember>(`/api/admin/team/${memberId}/reset-two-step`);
  },

  async adminActivity(filters: { before?: string | null; actor_id?: string; project_id?: string; limit?: number } = {}): Promise<ActivityPage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, String(value));
    const query = params.toString();
    return request<ActivityPage>(`/api/admin/activity${query ? `?${query}` : ''}`);
  },

  async adminSearch(q: string, signal?: AbortSignal): Promise<SearchResults> {
    return request<SearchResults>(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal });
  },

  /** The latest alerts and how many came in since you last looked, on any device. */
  async adminAlerts(): Promise<AlertList> {
    return request<AlertList>('/api/admin/alerts');
  },

  async adminMarkAlertsSeen(): Promise<{ status: string; seen_at: string }> {
    return post<{ status: string; seen_at: string }>('/api/admin/alerts/seen');
  },

  /** Email a fresh 7-day link to set a password and sign in. */
  async adminInviteClient(clientId: string): Promise<{ status: string; email: string }> {
    return post<{ status: string; email: string }>(`/api/admin/clients/${clientId}/invite`);
  },
};
