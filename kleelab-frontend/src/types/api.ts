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
  seo_title?: string;
  seo_description?: string;
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

export interface Template {
  id: string;
  title: string;
  category: string;
  description: string;
  thumbnail_url: string;
  is_premium: boolean;
  config?: Record<string, unknown>;
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
