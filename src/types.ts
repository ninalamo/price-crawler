export interface Store {
  id: number;
  name: string;
  url: string | null;
  created_at: string;
}

export interface CrawlSession {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  stores_crawled: string;
  total_products: number;
  total_errors: number;
}

export interface Product {
  id?: number;
  store_id: number;
  category_id: number | null;
  name: string;
  brand: string | null;
  unit: string | null;
  price: number;
  original_price: number | null;
  currency: string;
  image_url: string | null;
  product_url: string | null;
  sku: string | null;
  is_available: boolean;
  crawl_session_id?: string | null;
  last_seen_at?: string | null;
}

export interface CrawlResult {
  store: string;
  category: string;
  products: Product[];
  errors: string[];
}

export type StoreName = 'sm' | 'shopwise' | 'robinsons' | 'metromart' | 'super8';
