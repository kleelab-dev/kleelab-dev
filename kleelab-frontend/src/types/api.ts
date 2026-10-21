/**
 * Shapes returned by the KleeLab API.
 *
 * Mirrors kleelab-backend/src/kleelab/schemas. Dates arrive as ISO strings.
 */

export type Role = 'client' | 'staff';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  role: Role;
  created_at: string;
}

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';
export type StageStatus = 'upcoming' | 'in_progress' | 'waiting_on_client' | 'done';
/** `note` is team-only: the client never receives it. */
export type UpdateKind = 'progress' | 'message' | 'approval' | 'note';
export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested';
export type RequestKind = 'deployment' | 'hosting' | 'maintenance' | 'change';
export type RequestStatus = 'open' | 'accepted' | 'declined' | 'done';
export type InvoiceStatus = 'unpaid' | 'paid' | 'cancelled';
export type Currency = 'USD' | 'GBP' | 'EUR' | 'NGN' | 'CAD' | 'AUD';

export interface Stage {
  id: string;
  position: number;
  name: string;
  description: string | null;
  status: StageStatus;
  due_date: string | null;
  completed_at: string | null;
}

export interface ProjectUpdate {
  id: string;
  stage_id: string | null;
  kind: UpdateKind;
  title: string | null;
  body: string;
  link_url: string | null;
  link_label: string | null;
  approval_status: ApprovalStatus | null;
  approval_note: string | null;
  resolved_at: string | null;
  created_at: string;
  author_name: string | null;
  from_team: boolean;
}

export interface ProjectRequest {
  id: string;
  kind: RequestKind;
  message: string | null;
  status: RequestStatus;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
  uploaded_by_name: string | null;
  from_team: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  title: string;
  amount_cents: number;
  currency: Currency;
  due_date: string | null;
  status: InvoiceStatus;
  pay_url: string | null;
  paid_at: string | null;
  /** 'paystack' when paid online by card; null when the team marked it paid. */
  paid_via?: string | null;
  payment_reference?: string | null;
  created_at: string;
}

export interface PaymentsConfig {
  enabled: boolean;
  provider: string;
  currencies: string[];
  test_mode: boolean;
}

export interface PaymentResult {
  status: 'paid' | 'pending' | 'failed' | 'mismatch';
  reference: string;
  invoice_id: string;
  invoice_number: string;
  project_id: string;
  amount_cents: number;
  currency: string;
}

export interface ProjectSummary {
  id: string;
  reference: string;
  title: string;
  status: ProjectStatus;
  target_date: string | null;
  current_stage: string | null;
  stages_done: number;
  stages_total: number;
  pending_approvals: number;
  open_requests: number;
  unpaid_invoices: number;
  updated_at: string;
  client_email: string | null;
  client_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  awaiting_reply: boolean;
}

export interface ProjectDetail {
  id: string;
  reference: string;
  title: string;
  summary: string | null;
  status: ProjectStatus;
  start_date: string | null;
  target_date: string | null;
  live_url: string | null;
  created_at: string;
  updated_at: string;
  stages: Stage[];
  updates: ProjectUpdate[];
  requests: ProjectRequest[];
  files: ProjectFile[];
  invoices: Invoice[];
  client_email: string | null;
  client_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  lead_id: string | null;
}

export type AttentionKind =
  | 'new_enquiry'
  | 'client_message'
  | 'open_request'
  | 'waiting_approval'
  | 'overdue_step'
  | 'unpaid_invoice';

export type ChatRole = 'visitor' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface ChatReply {
  reply: string;
  suggestions: string[];
  offer_contact: boolean;
  source: 'ai' | 'fallback';
}
