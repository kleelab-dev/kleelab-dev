export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  /** Commercial tier key: `free`, `pro` or `enterprise`. */
  plan: string;
  created_at: string;
}

/** What a plan includes. Mirrors `services/plans.PlanLimits` on the backend. */
export interface PlanLimits {
  sites: number;
  pages_per_site: number;
  ai_builds_per_month: number;
  ai_calls_per_day: number;
  custom_domain: boolean;
  storefront: boolean;
}

export interface PlanUsage {
  sites: number;
  ai_builds_this_month: number;
  ai_calls_today: number;
}

/**
 * The signed-in account as `/api/auth/me` returns it.
 *
 * Limits and usage come from the server rather than being hardcoded here: a
 * client that believes its own copy of the rules disagrees with the server the
 * first time a limit changes, and the disagreement shows up as a confusing
 * refusal at the exact moment someone tries to act.
 */
export interface Account extends User {
  plan_label: string;
  plan_blurb: string;
  limits: PlanLimits;
  usage: PlanUsage;
}

// ---------------------------------------------------------------------------
// AI site builder
// ---------------------------------------------------------------------------

export type AiPalette = 'neutral' | 'warm' | 'ocean' | 'forest' | 'plum' | 'dark';

/** Whether the builder can run, asked before offering a prompt box. */
export interface AiStatus {
  available: boolean;
  /** `not_configured` or `quota_exhausted` when unavailable. */
  reason: string | null;
  builds_remaining: number;
  builds_per_month: number;
}

export interface AiBriefPage {
  title: string;
  slug: string;
  purpose: string;
  /** Section ids, chosen from the kit and validated by the server. */
  sections: string[];
}

export interface AiBrief {
  business_name: string;
  tagline: string;
  summary: string;
  audience: string;
  tone: string;
  palette: AiPalette;
  pages: AiBriefPage[];
}

export interface AiBriefResponse {
  brief: AiBrief;
  model: string;
  tokens_in: number;
  tokens_out: number;
}

/** One section the kit can build, described by the kit itself. */
export interface AiSectionSpec {
  id: string;
  name: string;
  description: string;
  example: Record<string, unknown>;
}

export interface AiContentResponse {
  sections: { id: string; content: Record<string, unknown> }[];
  model: string;
  tokens_in: number;
  tokens_out: number;
}

/**
 * One node of a page, as the builder conversation is allowed to see it.
 *
 * The model never receives the document. It receives this: a flat list of ids it
 * may aim an edit at, with just enough text to recognise which is which. Sending
 * the tree would invite it to return a tree, and a returned tree cannot be
 * checked — every word nobody asked to change would be rewritten from memory.
 */
export interface AiOutlineNode {
  id: string;
  type: string;
  /** Where the node sits, or its own copy — enough to tell two headings apart. */
  label: string;
  text: string;
}

/** The closed set of changes the builder may ask for. */
export type AiEditOpName =
  | 'set_text'
  | 'set_style'
  | 'set_theme'
  | 'set_image'
  | 'replace_section'
  | 'add_section'
  | 'remove_section'
  | 'move_section';

/** One change, aimed at one node. Only the fields its `op` needs are set. */
export interface AiEditOperation {
  op: AiEditOpName;
  node_id?: string | null;
  after_node_id?: string | null;
  text?: string | null;
  style?: Record<string, unknown> | null;
  slot?: string | null;
  colour?: string | null;
  section_id?: string | null;
  content?: Record<string, unknown> | null;
  src?: string | null;
  alt?: string | null;
}

/**
 * What the conversation replies with.
 *
 * `summary` is the sentence shown in the chat, and it is derived from the
 * operations that survived validation rather than written by the model alone —
 * an assistant that describes a change it did not make is worse than one that
 * admits it could not.
 */
export interface AiEditResponse {
  operations: AiEditOperation[];
  summary: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
}

export interface Site {
  id: string;
  name: string;
  subdomain: string | null;
  custom_domain?: string | null;
  is_published: boolean;
  /** ISO-4217. What this site sells in; used to render every price it shows. */
  currency: string;
  template_id?: string | null;
  // Optional: present only on endpoints that join extra data.
  owner_id?: string;
  pages_count?: number;
  products_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Page {
  id: string;
  site_id: string;
  title: string;
  slug: string;
  content_json: Record<string, unknown>;
  is_published: boolean;
  // These were declared as `seo_title` / `seo_description`, which the backend has
  // never had. Pydantic ignores unknown fields, so passing them would have been
  // accepted and then silently discarded — a save that reports success and
  // changes nothing. They match `PageOut` now.
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  created_at: string;
  updated_at: string;
}

export type BlockType = 'hero' | 'text' | 'image' | 'features' | 'testimonials' | 'contact';

export interface BuilderBlock {
  id: string;
  type: BlockType;
  eyebrow?: string;
  title?: string;
  body?: string;
  cta?: string;
  image_url?: string;
  items?: string[];
}

export interface PageVersion {
  id: string;
  page_id: string;
  version_number: number;
  content_json: Record<string, unknown>;
  created_at: string;
  created_by?: string;
}

export interface Product {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  price: number;
  images: string[] | null;
  stock: number;
  category: string | null;
  variants: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Matches ALLOWED_STATUSES in `routers/orders.py`. */
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'refunded';

/**
 * One line of an order.
 *
 * Orders store a snapshot rather than a foreign key, because products can be
 * edited or deleted and an order has to stay readable regardless.
 */
export interface OrderLine {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface Order {
  id: string;
  site_id: string;
  customer_email: string;
  customer_name: string | null;
  total: number;
  currency: string;
  status: OrderStatus;
  items: OrderLine[];
  created_at: string;
  updated_at: string;
}

/** What the owner sends when creating or editing a product. */
export interface ProductInput {
  name: string;
  description?: string | null;
  price: number;
  stock: number;
  category?: string | null;
  images?: string[] | null;
  is_active?: boolean;
}

export interface DashboardStats {
  site_count: number;
  page_count: number;
  product_count: number;
  order_count: number;
  total_revenue: number;
  monthly_views: number;
}

export interface ActivityEvent {
  type: 'order_received' | 'site_published' | 'page_updated';
  title: string;
  description: string;
  /** Present on order events, so the client does the formatting. */
  amount?: number;
  currency?: string;
  timestamp: string;
}

export interface OrderSeriesDay {
  date: string;
  orders: number;
  revenue: number;
}

export interface OrderSeries {
  days: OrderSeriesDay[];
}

export interface Asset {
  id: string;
  site_id: string | null;
  filename: string;
  file_type: string;
  file_size: number;
  url: string;
  created_at: string;
}

/**
 * Storefront (shopper-facing) shapes.
 *
 * These come from the public router, which deliberately does not expose the raw
 * stock count - only whether the item can be bought.
 */
export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  category: string | null;
  in_stock: boolean;
}

export interface PublicOrder {
  id: string;
  status: string;
  total: number;
  currency: string;
  items: OrderLine[];
  created_at: string;
}

/** What a shopper sends. Note the absence of any price - the server decides. */
export interface OrderLineInput {
  product_id: string;
  quantity: number;
}

export interface PublicOrderCreate {
  customer_email: string;
  customer_name?: string | null;
  items: OrderLineInput[];
  note?: string | null;
}
