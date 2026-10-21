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
  /** Staff only: whether sign-in asks for a code from an authenticator app. */
  two_step_enabled?: boolean;
}

/** The password was right and two-step is on: swap this for a session with a code. */
export interface TwoStepChallenge {
  two_step_required: true;
  challenge: string;
  expires_in: number;
}

export interface TwoStepStatus {
  enabled: boolean;
  enabled_at: string | null;
  recovery_codes_left: number;
}

export interface TwoStepSetup {
  secret: string;
  otpauth_uri: string;
  /** An SVG data URI of the QR code. */
  qr_svg: string;
}

export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  is_active: boolean;
  two_step_enabled: boolean;
  created_at: string;
  /** Null until they first sign in, so an unanswered invite shows. */
  last_sign_in: string | null;
  projects_in_charge: number;
  is_you: boolean;
}

export interface ActivityEvent {
  id: string;
  action: string;
  summary: string;
  actor_id: string | null;
  actor_name: string | null;
  by_client: boolean;
  project_id: string | null;
  project_reference: string | null;
  project_title: string | null;
  subject_type: string | null;
  subject_id: string | null;
  created_at: string;
}

export interface ActivityPage {
  events: ActivityEvent[];
  /** Pass back as `before` for the next, older page. Null when there is no more. */
  next_before: string | null;
}

export interface SearchResults {
  projects: { id: string; reference: string; title: string; status: ProjectStatus; client_name: string | null }[];
  clients: { id: string; name: string | null; email: string; is_active: boolean }[];
  leads: { id: string; name: string | null; email: string; company: string | null; status: LeadStatus; created_at: string }[];
  invoices: {
    id: string;
    number: string;
    title: string;
    status: InvoiceStatus;
    amount_cents: number;
    currency: string;
    due_date: string | null;
    project_id: string;
    project_reference: string;
  }[];
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
  /** 'paystack' when the client paid online by card; null when marked paid by hand. */
  paid_via?: string | null;
  /** The Paystack reference for an online payment, to find it in their dashboard. */
  payment_reference?: string | null;
  created_at: string;
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
  client_id: string | null;
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
  client_id: string | null;
  owner_id: string | null;
  owner_name: string | null;
  lead_id: string | null;
}

export interface ProjectCreateInput {
  client_email: string;
  client_name?: string | null;
  title: string;
  summary?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  stages?: string[] | null;
  owner_id?: string | null;
  lead_id?: string | null;
}

export interface ProjectPatchInput {
  title?: string;
  summary?: string | null;
  status?: ProjectStatus;
  start_date?: string | null;
  target_date?: string | null;
  live_url?: string | null;
  owner_id?: string | null;
}

export interface StagePatchInput {
  name?: string;
  status?: StageStatus;
  due_date?: string | null;
  description?: string | null;
}

export interface StaffUpdateInput {
  kind: UpdateKind;
  title?: string | null;
  body: string;
  stage_id?: string | null;
  link_url?: string | null;
  link_label?: string | null;
}

export interface InvoiceCreateInput {
  title: string;
  amount_cents: number;
  currency: Currency;
  due_date?: string | null;
  pay_url?: string | null;
}

export interface InvoicePatchInput {
  status?: InvoiceStatus;
  due_date?: string | null;
  pay_url?: string | null;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
}

export type AttentionKind =
  | 'new_enquiry'
  | 'follow_up'
  | 'client_message'
  | 'open_request'
  | 'waiting_approval'
  | 'overdue_step'
  | 'unpaid_invoice';

export interface AttentionItem {
  kind: AttentionKind;
  project_id: string | null;
  reference: string | null;
  project_title: string | null;
  text: string;
  since: string | null;
  owner_name: string | null;
  lead_id: string | null;
}

export type LeadStatus = 'new' | 'contacted' | 'won' | 'lost';

export interface Lead {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  interest: string | null;
  budget: string | null;
  source: string;
  feature_requested: string | null;
  message: string | null;
  status: LeadStatus;
  created_at: string;
  /** `YYYY-MM-DD`: the day to chase this enquiry next. */
  follow_up_on: string | null;
  project_id: string | null;
}

export interface LeadNote {
  id: string;
  /** `note` stays with the team; `email` was sent to the enquirer. */
  kind: 'note' | 'email';
  subject: string | null;
  body: string;
  author_name: string | null;
  created_at: string;
}

export interface LeadDetail extends Lead {
  notes: LeadNote[];
}

export interface LeadPatchInput {
  status?: LeadStatus;
  /** `null` clears the date. */
  follow_up_on?: string | null;
}

export interface MoneyTotal {
  currency: string;
  cents: number;
  count: number;
}

export interface AdminStats {
  new_enquiries: number;
  enquiries_this_month: number;
  follow_ups_due: number;
  active_projects: number;
  paused_projects: number;
  waiting_on_client: number;
  unpaid: MoneyTotal[];
  overdue: MoneyTotal[];
  paid_this_month: MoneyTotal[];
}

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

/** An invoice with the project and client it belongs to (the money page). */
export interface AdminInvoice extends Invoice {
  project_id: string;
  project_title: string;
  project_reference: string;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
}

export interface ClientSummary {
  id: string;
  name: string | null;
  email: string;
  is_active: boolean;
  created_at: string;
  /** Null until they first sign in: the invite was never used. */
  last_sign_in: string | null;
  last_activity: string | null;
  project_count: number;
  active_projects: number;
  /** Per currency; cancelled invoices are left out. */
  billed: MoneyTotal[];
  paid: MoneyTotal[];
  outstanding: MoneyTotal[];
}

export interface ClientDetail extends ClientSummary {
  projects: ProjectSummary[];
  invoices: AdminInvoice[];
}

export interface ClientPatchInput {
  full_name?: string | null;
  is_active?: boolean;
}
