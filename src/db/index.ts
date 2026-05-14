import { createClient } from '@supabase/supabase-js';
import { CrawlSession, Product, Store } from '../types.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

const supabase = createClient(supabaseUrl, supabaseKey || '');

export function createCrawlSession(stores: string[]): CrawlSession {
  const now = new Date();
  const id = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

  (async () => {
    const { error } = await supabase.from('crawl_sessions').insert({
      id,
      started_at: now.toISOString(),
      status: 'running',
      stores_crawled: stores.join(','),
    });
    if (error) console.error('Failed to create session:', error.message);
  })();

  return {
    id, started_at: now.toISOString(), completed_at: null,
    status: 'running' as const, stores_crawled: stores.join(','),
    total_products: 0, total_errors: 0,
  };
}

export async function updateCrawlSession(
  id: string, status: 'completed' | 'failed', totalProducts: number, totalErrors: number,
): Promise<void> {
  const { error } = await supabase
    .from('crawl_sessions')
    .update({
      status,
      completed_at: new Date().toISOString(),
      total_products: totalProducts,
      total_errors: totalErrors,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function getCrawlSessions(limit = 20): Promise<CrawlSession[]> {
  const { data, error } = await supabase
    .from('crawl_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as unknown as CrawlSession[];
}

export async function getOrCreateStore(name: string, url?: string): Promise<Store> {
  const { data: existing } = await supabase
    .from('stores')
    .select('*')
    .eq('name', name)
    .maybeSingle();
  if (existing) return existing as unknown as Store;

  const { data, error } = await supabase
    .from('stores')
    .insert({ name, url: url ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Store;
}

export async function getOrCreateCategory(storeId: number, name: string, url?: string): Promise<number> {
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('store_id', storeId)
    .eq('name', name)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('categories')
    .insert({ store_id: storeId, name, url: url ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function upsertProduct(product: Product, crawlSessionId?: string): Promise<number> {
  let query = supabase
    .from('products')
    .select('id, price')
    .eq('store_id', product.store_id)
    .eq('name', product.name);

  if (product.sku != null) {
    query = query.eq('sku', product.sku);
  } else {
    query = query.is('sku', null);
  }

  const { data: existing } = await query.maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const { error } = await supabase
      .from('products')
      .update({
        category_id: product.category_id,
        brand: product.brand,
        unit: product.unit,
        price: product.price,
        original_price: product.original_price,
        image_url: product.image_url,
        product_url: product.product_url,
        is_available: true,
        crawl_session_id: crawlSessionId ?? null,
        last_seen_at: now,
        updated_at: now,
      })
      .eq('id', existing.id);
    if (error) throw error;

    if (existing.price !== product.price) {
      const { error: histError } = await supabase
        .from('price_history')
        .insert({
          product_id: existing.id,
          price: product.price,
          original_price: product.original_price,
          currency: product.currency,
        });
      if (histError) throw histError;
    }
    return existing.id;
  }

  const { data: newProduct, error } = await supabase
    .from('products')
    .insert({
      store_id: product.store_id,
      category_id: product.category_id,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      price: product.price,
      original_price: product.original_price,
      currency: product.currency,
      image_url: product.image_url,
      product_url: product.product_url,
      sku: product.sku,
      is_available: true,
      crawl_session_id: crawlSessionId ?? null,
      last_seen_at: now,
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: histError } = await supabase
    .from('price_history')
    .insert({
      product_id: newProduct.id,
      price: product.price,
      original_price: product.original_price,
      currency: product.currency,
    });
  if (histError) throw histError;

  return newProduct.id;
}

export async function markProductsNotInSession(crawlSessionId: string, storeIds: number[]): Promise<number> {
  let total = 0;
  for (const storeId of storeIds) {
    const { data, error } = await supabase
      .from('products')
      .update({ is_available: false })
      .eq('store_id', storeId)
      .eq('is_available', true)
      .or(`crawl_session_id.is.null,crawl_session_id.neq.${crawlSessionId}`)
      .select('id');
    if (error) throw error;
    total += data?.length || 0;
  }
  return total;
}

export async function getProductCount(storeId: number): Promise<number> {
  const { count, error } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId);
  if (error) throw error;
  return count || 0;
}

export async function closeDb(): Promise<void> {
}

export default supabase;
