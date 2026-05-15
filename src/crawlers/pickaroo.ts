import { BaseCrawler } from './base.js';
import { CrawlResult, Product } from '../types.js';
import { getOrCreateStore, getOrCreateCategory } from '../db/index.js';
import { batchUpsertProducts } from '../db/batch.js';

interface ApiResponse {
  html: string;
  next?: number | null;
  prev?: string;
  page?: number;
}

interface PickarooProduct {
  name: string;
  unit: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  sku: string;
}

export class PickarooCrawler extends BaseCrawler {
  private storeSlug: string;
  private branchSlug: string;

  constructor(storeName: string, storeSlug: string, branchSlug: string) {
    super(storeName, 'https://pickaroo.com');
    this.storeSlug = storeSlug;
    this.branchSlug = branchSlug;
  }

  get storePrettyName(): string {
    return `${this.storeName} (${this.branchSlug})`;
  }

  async init(): Promise<void> {
    // no Playwright needed
  }

  async destroy(): Promise<void> {
    // no Playwright needed
  }

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    const store = await getOrCreateStore(this.storeName, this.baseUrl);
    const storeId = store.id;

    const categories = await this.discoverCategories();
    if (categories.length === 0) {
      console.log(`  [${this.storeName}] No categories found`);
      return results;
    }

    console.log(`  [${this.storeName}] Found ${categories.length} categories`);

    for (const cat of categories) {
      console.log(`  [${this.storeName}] ${cat.name}...`);
      const result = await this.crawlCategory(storeId, cat.name, cat.group);
      results.push(result);
    }

    return results;
  }

  private async discoverCategories(): Promise<{ name: string; group: string }[]> {
    const baseUrl = `${this.baseUrl}/${this.storeSlug}/products/${this.branchSlug}`;
    const resp = await fetch(baseUrl, {
      headers: { 'Accept-Language': 'en-PH,en;q=0.9,fil;q=0.8' },
    });
    const html = await resp.text();

    const categories: { name: string; group: string }[] = [];
    const seen = new Set<string>();
    const linkRegex = /<a[\s\S]*?\?group=([^"&]+)[^"]*list=true[^"]*"[\s\S]*?<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      const group = match[1];
      if (seen.has(group)) continue;
      seen.add(group);
      const name = match[0].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
      if (!name || name.length > 50) continue;
      categories.push({ name, group });
    }

    return categories;
  }

  private async crawlCategory(
    storeId: number, categoryName: string, group: string,
  ): Promise<CrawlResult> {
    const result: CrawlResult = { store: this.storePrettyName, category: categoryName, products: [], errors: [] };
    const categoryUrl = `${this.baseUrl}/${this.storeSlug}/products/${this.branchSlug}?group=${group}&list=true`;
    const categoryId = await getOrCreateCategory(storeId, categoryName, categoryUrl);

    // Fetch all pages
    const allProducts: Product[] = [];
    let page = 1;

    while (true) {
      const data = await this.fetchPage(group, page);
      if (!data || !data.html) break;
      const parsed = this.parseProducts(data.html);
      if (parsed.length === 0) break;

      for (const p of parsed) {
        allProducts.push(this.makeProduct({
          storeId, categoryId, name: p.name, unit: p.unit,
          price: p.price, originalPrice: p.originalPrice, imageUrl: p.imageUrl, productUrl: categoryUrl,
          sku: p.sku,
        }));
      }

      if (!data.next) break;
      page = data.next;
    }

    if (allProducts.length === 0) return result;

    // Batch upsert all products at once
    try {
      await batchUpsertProducts(allProducts, this.crawlSessionId);
      result.products.push(...allProducts);
    } catch (err: any) {
      result.errors.push(`Batch upsert failed: ${err.message}`);
    }

    console.log(`    -> ${result.products.length} products`);
    return result;
  }

  private async fetchPage(group: string, page: number): Promise<ApiResponse | null> {
    try {
      const url = `${this.baseUrl}/${this.storeSlug}/products/${this.branchSlug}/search-inventories?group=${group}&page=${page}`;
      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept-Language': 'en-PH,en;q=0.9,fil;q=0.8',
        },
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  private parseProducts(html: string): PickarooProduct[] {
    const products: PickarooProduct[] = [];
    const cardStarts = html.split('<div class="three columns new_columns two_column_mobile inventory-card"');
    for (let i = 1; i < cardStarts.length; i++) {
      const chunk = cardStarts[i];
      const invMatch = chunk.match(/data-inventory-id="(\d+)"/);
      const inventoryId = invMatch ? invMatch[1] : '';
      if (!inventoryId) continue;

      let name = '', unit = '', price = 0, imageUrl: string | null = null;

      const nameMatch = chunk.match(/data-variant-name="([^"]*)"/);
      if (nameMatch) name = nameMatch[1].trim();

      if (!name) {
        const nameSpan = chunk.match(/<span class="name">([\s\S]*?)<\/span>/);
        if (nameSpan) name = nameSpan[1].trim();
      }
      if (!name) continue;

      const unitMatch = chunk.match(/<span class="desc">([\s\S]*?)<\/span>/);
      if (unitMatch) unit = unitMatch[1].trim();

      const priceMatch = chunk.match(/data-price="\s*([\d,.]+)\s*"/);
      if (priceMatch) price = parseFloat(priceMatch[1].replace(/,/g, ''));

      if (!price) {
        const priceSpan = chunk.match(/₱\s*([\d,]+(?:\.\d+)?)/);
        if (priceSpan) price = parseFloat(priceSpan[1].replace(/,/g, ''));
      }

      const photoMatch = chunk.match(/data-variant-photo="\s*([^"]*)\s*"/);
      if (photoMatch) imageUrl = photoMatch[1].trim() || null;

      const variantIdMatch = chunk.match(/data-variant-id="([^"]+)"/);
      const variantId = variantIdMatch ? variantIdMatch[1] : inventoryId;
      const sku = `${this.storeSlug}-${this.branchSlug}-${variantId}`;

      products.push({ name, unit, price, originalPrice: null, imageUrl, sku });
    }

    return products;
  }
}
