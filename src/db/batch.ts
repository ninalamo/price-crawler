import supabase from './index.js';
import { Product } from '../types.js';

interface SaveResult {
  id?: number;
  error?: string;
}

export async function batchUpsertProducts(
  products: Product[], crawlSessionId?: string,
): Promise<SaveResult[]> {
  if (products.length === 0) return [];

  const storeId = products[0].store_id;
  const now = new Date().toISOString();

  // Load all existing products for this store into memory
  const { data: existing } = await supabase
    .from('products')
    .select('id, store_id, name, sku, price, category_id')
    .eq('store_id', storeId);

  const existingMap = new Map<string, { id: number; price: number; category_id: number | null }>();
  for (const p of existing || []) {
    const key = `${p.name}|${p.sku ?? ''}`;
    existingMap.set(key, { id: p.id, price: p.price, category_id: p.category_id });
  }

  // Categorize products
  const toInsert: any[] = [];
  const toUpdate: { id: number; price: number; original_price: number | null; category_id: number | null }[] = [];
  const priceChanges: { product_id: number; price: number; original_price: number | null }[] = [];
  const results: SaveResult[] = [];

  for (const p of products) {
    const key = `${p.name}|${p.sku ?? ''}`;
    const existing = existingMap.get(key);

    if (existing) {
      if (existing.price !== p.price) {
        priceChanges.push({ product_id: existing.id, price: p.price, original_price: p.original_price });
      }
      toUpdate.push({
        id: existing.id,
        price: p.price,
        original_price: p.original_price,
        category_id: p.category_id ?? existing.category_id,
      });
      results.push({ id: existing.id });
    } else {
      toInsert.push({
        store_id: p.store_id,
        category_id: p.category_id,
        name: p.name,
        brand: p.brand,
        unit: p.unit,
        price: p.price,
        original_price: p.original_price,
        currency: p.currency,
        image_url: p.image_url,
        product_url: p.product_url,
        sku: p.sku,
        is_available: true,
        crawl_session_id: crawlSessionId ?? null,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      });
    }
  }

  const allPromises: Promise<any>[] = [];

  const asPromise = <T>(p: PromiseLike<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      p.then(resolve, reject);
    });

  // Batch insert new products
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500);
      allPromises.push(asPromise(supabase.from('products').insert(batch).select('id')));
    }
  }

  // Batch update existing products (concurrently but individually)
  if (toUpdate.length > 0) {
    for (const item of toUpdate) {
      allPromises.push(
        asPromise(
          supabase
            .from('products')
            .update({
              price: item.price,
              original_price: item.original_price,
              category_id: item.category_id,
              is_available: true,
              crawl_session_id: crawlSessionId ?? null,
              last_seen_at: now,
              updated_at: now,
            })
            .eq('id', item.id),
        ),
      );
    }
  }

  // Record price changes
  if (priceChanges.length > 0) {
    const historyBatch = priceChanges.map(pc => ({
      product_id: pc.product_id,
      price: pc.price,
      original_price: pc.original_price,
      currency: 'PHP',
      recorded_at: now,
    }));
    allPromises.push(asPromise(supabase.from('price_history').insert(historyBatch)));
  }

  await Promise.all(allPromises);

  return results;
}
