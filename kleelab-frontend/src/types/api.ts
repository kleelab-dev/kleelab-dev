export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

export interface Site {
  id: string;
  name: string;
  subdomain: string;
  custom_domain?: string | null;
  is_published: boolean;
  owner_id: string;
  template_id?: string | null;
  pages_count?: number;
  products_count?: number;
  created_at: string;
  updated_at: string;
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
  description?: string;
  price: number;
  currency: string;
  inventory_count: number;
  is_active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  site_id: string;
  customer_email: string;
  total_amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  items_count: number;
  created_at: string;
}

export interface Asset {
  id: string;
  site_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
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

export interface Subscription {
  id: string;
  user_id: string;
  plan_name: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  current_period_end: string;
  cancel_at_period_end: boolean;
}

export interface DashboardStats {
  sites_count: number;
  total_views: number;
  total_orders: number;
  total_revenue: number;
  active_subscriptions: number;
  conversion_rate: number;
}

export interface ActivityItem {
  id: string;
  type: 'site_published' | 'order_received' | 'page_updated' | 'asset_uploaded';
  title: string;
  description: string;
  timestamp: string;
}

export type TabType = 
  | 'overview' 
  | 'sites' 
  | 'pages' 
  | 'products' 
  | 'orders' 
  | 'assets' 
  | 'analytics' 
  | 'templates' 
  | 'settings';
