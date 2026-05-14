import { Page } from 'playwright';
import { BaseCrawler } from './base.js';
import { CrawlResult } from '../types.js';
import { getOrCreateStore, getOrCreateCategory, upsertProduct } from '../db/index.js';

interface PickarooProduct {
  name: string;
  unit: string;
  price: number;
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

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    const store = await getOrCreateStore(this.storeName, this.baseUrl);
    const storeId = store.id;

    const page = await this.newPage();
    try {
      const rootUrl = `${this.baseUrl}/${this.storeSlug}/products/${this.branchSlug}`;
      console.log(`  [${this.storeName}] Loading page to discover categories...`);
      await this.throttle();
      await page.goto(rootUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const categories = await page.evaluate(() => {
        const links = document.querySelectorAll('a.menu-item, a[href*="group="]');
        const seen = new Set<string>();
        return Array.from(links)
          .map(a => ({
            name: a.textContent?.trim() || '',
            href: a.getAttribute('href') || '',
          }))
          .filter(l => {
            const match = l.href.match(/[?&]group=([^&]+)/);
            const key = match?.[1] || '';
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
      });

      console.log(`  [${this.storeName}] Found ${categories.length} categories`);

      for (const cat of categories) {
        const url = `${this.baseUrl}${cat.href.startsWith('/') ? '' : '/'}${cat.href}`;
        console.log(`  [${this.storeName}] ${cat.name}...`);
        const result = await this.crawlCategory(page, storeId, cat.name, url);
        results.push(result);
      }

      if (categories.length === 0) {
        console.log(`  [${this.storeName}] No categories found. Trying direct extraction...`);
        const result = await this.crawlCategory(page, storeId, 'all', rootUrl);
        results.push(result);
      }

    } finally {
      await page.close();
    }

    return results;
  }

  private async crawlCategory(
    page: Page, storeId: number, categoryName: string, url: string,
  ): Promise<CrawlResult> {
    const result: CrawlResult = { store: this.storePrettyName, category: categoryName, products: [], errors: [] };

    try {
      await this.throttle();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const products = await this.extractProducts(page);
      const categoryId = await getOrCreateCategory(storeId, categoryName, url);

      for (const p of products) {
        try {
          const pd = this.makeProduct({
            storeId, categoryId, name: p.name, unit: p.unit,
            price: p.price, imageUrl: p.imageUrl, productUrl: url,
            sku: p.sku,
          });
          await upsertProduct(pd, this.crawlSessionId);
          result.products.push(pd);
        } catch (err: any) {
          result.errors.push(`Save "${p.name}": ${err.message}`);
        }
      }
      console.log(`    -> ${products.length} products`);
    } catch (err: any) {
      result.errors.push(`Category "${categoryName}": ${err.message}`);
    }

    return result;
  }

  private async extractProducts(page: Page): Promise<PickarooProduct[]> {
    const branch = this.branchSlug;
    const slug = this.storeSlug;
    return await page.evaluate(
      ({ branch: b, slug: s }: { branch: string; slug: string }) => {
        const products: any[] = [];
        const buttons = document.querySelectorAll('button.add-to-cart-button');

        buttons.forEach((btn) => {
          const name = btn.getAttribute('data-variant-name') || '';
          const variantId = btn.getAttribute('data-variant-id') || '';
          const photo = btn.getAttribute('data-variant-photo') || '';
          const priceStr = (btn.getAttribute('data-price') || '').trim();
          const price = parseFloat(priceStr);

          if (!name || !price) return;

          let unit = '';
          const card = btn.closest('[class*="item"], [class*="product"], li, div');
          if (card) {
            const allText = (card as HTMLElement).innerText;
            const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
            const nameIdx = lines.findIndex(l => l === name);
            if (nameIdx >= 0 && nameIdx + 1 < lines.length) {
              const next = lines[nameIdx + 1];
              if (/^~?\s*\d/.test(next)) {
                unit = next;
              }
            }
          }

          products.push({
            name: name.trim(),
            unit: unit || '',
            price,
            imageUrl: photo?.trim() || null,
            sku: `${s}-${b}-${variantId}`,
          });
        });

        return products;
      },
      { branch, slug }
    );
  }
}
