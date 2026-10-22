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
  /** The kinds of email this person can turn off, and whether each is on. */
  email_topics?: EmailTopic[];
}

export interface EmailTopic {
  key: string;
  label: string;
  description: string;
  on: boolean;
}

/** After a password change or "sign out other devices". */
export interface OtherSessionsSignedOut {
  /** How many other devices were signed out. */
  signed_out: number;
  /** Set only when this device was signed out too and must carry on with a new session. */
  tokens: { access_token: string; refresh_token?: string | null } | null;
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
  /** Files and pictures sent with this message. */
  attachments: ProjectFile[];
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
  /** The message this file was sent with, if any. */
  update_id: string | null;
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
  /** deposit | balance | full when raised from an accepted proposal. */
  kind?: 'deposit' | 'balance' | 'full' | 'care' | null;
  reminders_sent?: number;
  last_reminded_at?: string | null;
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
  /** Still to be billed at hand-over: the rest of the accepted proposal's price. */
  balance_due_cents?: number | null;
  balance_currency?: string | null;
  client_email: string | null;
  client_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  lead_id: string | null;
  /** Getting started: what the team needs from the client to begin. */
  checklist: ChecklistItem[];
  /** Only once the team has published it. */
  handover: Handover | null;
  /** Looking after the site once it is live, when there is a plan. */
  care_plan?: CarePlan | null;
}

export interface CarePlan {
  id: string;
  name: string;
  includes: string | null;
  amount_cents: number;
  currency: string;
  interval: 'month' | 'year';
  /** Hours of work included each period, in minutes; null when not counted. */
  minutes_included: number | null;
  status: 'active' | 'paused' | 'ended';
  started_on: string;
  next_bill_on: string;
  period_start: string | null;
  minutes_used: number | null;
}

export interface ChecklistItem {
  id: string;
  position: number;
  title: string;
  description: string | null;
  done_at: string | null;
  note: string | null;
  done_by_name: string | null;
}

export interface HandoverItem {
  label: string;
  value: string | null;
  url: string | null;
}

export interface Handover {
  notes: string | null;
  items: HandoverItem[];
  published_at: string | null;
  updated_at: string;
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

// --- Proposals ---------------------------------------------------------------

/** `expired` is worked out from the date; it is never stored. */
export type ProposalStatus = 'sent' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

/** A proposal as its client sees it, from the link in their email. */
export interface PublicProposal {
  reference: string;
  /** Sent back when answering, so nobody accepts a version they did not see. */
  revision: number;
  status: ProposalStatus;
  client_name: string | null;
  title: string;
  summary: string | null;
  scope: string | null;
  items: { description: string; amount_cents: number }[];
  currency: Currency;
  total_cents: number;
  deposit_percent: number;
  deposit_cents: number;
  duration_weeks: number | null;
  stages: { name: string; description?: string | null }[];
  terms: string | null;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  /** How the client chose to pay: the deposit first, or everything at once. */
  payment_choice?: 'deposit' | 'full' | null;
  declined_at: string | null;
  prepared_by: string | null;
}

export interface ProposalAccepted {
  proposal: PublicProposal;
  /** True when we just made their account and emailed a link to set a password. */
  invited: boolean;
  /** False when that email did not go out, so they set a password through "forgot password". */
  invite_sent: boolean;
  email: string;
}

// --- Free first calls ----------------------------------------------------------

export interface CallSlots {
  duration_minutes: number;
  /** The team's time zone, e.g. "Lagos time (WAT)". */
  timezone_label: string;
  utc_offset_minutes: number;
  /** Free start times in UTC, soonest first. */
  slots: string[];
}

/** A booked call, as the booker sees it from their link. */
export interface PublicCall {
  name: string;
  company: string | null;
  notes: string | null;
  starts_at: string;
  duration_minutes: number;
  status: 'booked' | 'cancelled';
  past: boolean;
  cancelled_at: string | null;
  cancelled_by: 'client' | 'team' | null;
  cancel_reason: string | null;
  meeting_url: string | null;
  calendar_url: string;
  timezone_label: string;
  utc_offset_minutes: number;
}

export interface CallBooked extends PublicCall {
  token: string;
}
