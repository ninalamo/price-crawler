import postgres from 'postgres';
import { CrawlSession, Product, Store } from '../types.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ph_price_hunter';

const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export function createCrawlSession(stores: string[]): CrawlSession {
  const now = new Date();
  const id = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

  sql`
    INSERT INTO crawl_sessions (id, started_at, status, stores_crawled)
    VALUES (${id}, NOW(), 'running', ${stores.join(',')})
  `.then(() => {}).catch((err: any) => console.error('Failed to create session:', err.message));

  return {
    id, started_at: now.toISOString(), completed_at: null,
    status: 'running' as const, stores_crawled: stores.join(','),
    total_products: 0, total_errors: 0,
  };
}

export async function updateCrawlSession(
  id: string, status: 'completed' | 'failed', totalProducts: number, totalErrors: number,
): Promise<void> {
  await sql`
    UPDATE crawl_sessions
    SET status = ${status}, completed_at = NOW(), total_products = ${totalProducts}, total_errors = ${totalErrors}
    WHERE id = ${id}
  `;
}

export async function getCrawlSessions(limit = 20): Promise<CrawlSession[]> {
  const rows = await sql`SELECT * FROM crawl_sessions ORDER BY started_at DESC LIMIT ${limit}`;
  return rows as unknown as CrawlSession[];
}

export async function getOrCreateStore(name: string, url?: string): Promise<Store> {
  const [existing] = await sql`SELECT * FROM stores WHERE name = ${name} LIMIT 1`;
  if (existing) return existing as unknown as Store;
  const [store] = await sql`
    INSERT INTO stores (name, url) VALUES (${name}, ${url ?? null}) RETURNING *
  `;
  return store as unknown as Store;
}

export async function getOrCreateCategory(storeId: number, name: string, url?: string): Promise<number> {
  const [existing] = await sql`SELECT id FROM categories WHERE store_id = ${storeId} AND name = ${name} LIMIT 1`;
  if (existing) return existing.id;
  const [cat] = await sql`
    INSERT INTO categories (store_id, name, url) VALUES (${storeId}, ${name}, ${url ?? null}) RETURNING id
  `;
  return cat.id;
}

export async function upsertProduct(product: Product, crawlSessionId?: string): Promise<number> {
  const [existing] = await sql`
    SELECT id, price FROM products
    WHERE store_id = ${product.store_id}
      AND sku IS NOT DISTINCT FROM ${product.sku}
      AND name = ${product.name}
    LIMIT 1
  `;

  const now = new Date().toISOString();

  if (existing) {
    await sql`
      UPDATE products SET
        category_id = ${product.category_id},
        brand = ${product.brand},
        unit = ${product.unit},
        price = ${product.price},
        original_price = ${product.original_price},
        image_url = ${product.image_url},
        product_url = ${product.product_url},
        is_available = true,
        crawl_session_id = COALESCE(${crawlSessionId ?? null}, crawl_session_id),
        last_seen_at = ${now},
        updated_at = NOW()
      WHERE id = ${existing.id}
    `;

    if (existing.price !== product.price) {
      await sql`
        INSERT INTO price_history (product_id, price, original_price, currency)
        VALUES (${existing.id}, ${product.price}, ${product.original_price}, ${product.currency})
      `;
    }
    return existing.id;
  }

  const [newProduct] = await sql`
    INSERT INTO products (store_id, category_id, name, brand, unit, price, original_price, currency, image_url, product_url, sku, is_available, crawl_session_id, last_seen_at)
    VALUES (${product.store_id}, ${product.category_id}, ${product.name}, ${product.brand}, ${product.unit},
      ${product.price}, ${product.original_price}, ${product.currency}, ${product.image_url},
      ${product.product_url}, ${product.sku}, true,
      ${crawlSessionId ?? null}, ${now})
    RETURNING id
  `;

  await sql`
    INSERT INTO price_history (product_id, price, original_price, currency)
    VALUES (${newProduct.id}, ${product.price}, ${product.original_price}, ${product.currency})
  `;

  return newProduct.id;
}

export async function markProductsNotInSession(crawlSessionId: string, storeIds: number[]): Promise<number> {
  let count = 0;
  for (const storeId of storeIds) {
    const result = await sql`
      UPDATE products SET is_available = false
      WHERE store_id = ${storeId}
        AND (crawl_session_id IS NULL OR crawl_session_id != ${crawlSessionId})
        AND is_available = true
    `;
    count += result.count;
  }
  return count;
}

export async function getProductCount(storeId: number): Promise<number> {
  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM products WHERE store_id = ${storeId}`;
  return count;
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}

export default sql;
