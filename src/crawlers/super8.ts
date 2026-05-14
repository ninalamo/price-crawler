import { Page } from 'playwright';
import { BaseCrawler } from './base.js';
import { CrawlResult } from '../types.js';
import { getOrCreateStore, getOrCreateCategory, upsertProduct } from '../db/index.js';

interface Super8Branch {
  provinceCode: string;
  cityCode: string;
  brgyCode: string;
  branchId: string;
}

const DEFAULT_BRANCH: Super8Branch = {
  provinceCode: '133900000',  // Metro Manila
  cityCode: '133901000',      // Manila - Tondo
  brgyCode: '133901001',      // First barangay in Tondo
  branchId: '1',              // Super8 Gagalangin
};

export class Super8Crawler extends BaseCrawler {
  constructor() {
    super('Super8', 'https://www.super8.ph');
  }

  get storePrettyName(): string {
    return 'Super8';
  }

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    const store = await getOrCreateStore('Super8', this.baseUrl);
    const storeId = store.id;

    const page = await this.newPage();
    try {
      await this.throttle();
      await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Dismiss the location modal via direct API
      const branchSet = await this.setBranchViaApi(page);
      if (branchSet) {
        console.log(`  [Super8] Branch set, reloading...`);
        await this.throttle();
        await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
      }

      // Get all product categories from the sidebar
      const categories = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/products"], [class*="category"] a, [class*="Category"] a, li a');
        const seen = new Set<string>();
        return Array.from(links)
          .map(a => ({
            name: a.textContent?.trim() || '',
            href: a.getAttribute('href') || '',
          }))
          .filter(l => l.href && l.name && !seen.has(l.name) && seen.add(l.name))
          .slice(0, 50);
      });

      if (categories.length > 0) {
        console.log(`  [Super8] Found ${categories.length} category links`);
        for (const cat of categories) {
          const url = cat.href.startsWith('http') ? cat.href : `https://www.super8.ph${cat.href}`;
          console.log(`  [Super8] ${cat.name}...`);
          const result = await this.crawlCategory(page, storeId, cat.name, url);
          results.push(result);
        }
      } else {
        console.log(`  [Super8] No categories found, extracting all products...`);
        const result = await this.crawlCategory(page, storeId, 'all', 'https://www.super8.ph/products');
        results.push(result);
      }
    } finally {
      await page.close();
    }

    return results;
  }

  private async setBranchViaApi(page: Page): Promise<boolean> {
    try {
      const result = await page.evaluate(async (branch) => {
        const meta = document.querySelector('meta[name="csrf-token"]');
        const token = meta?.getAttribute('content') || '';
        if (!token) return false;

        const resp = await fetch('/branches/set-branch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-TOKEN': token,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: new URLSearchParams({
            province_code: branch.provinceCode,
            city_code: branch.cityCode,
            brgy_code: branch.brgyCode,
            branch_id: branch.branchId,
          }),
        });
        return resp.ok;
      }, DEFAULT_BRANCH);

      return result;
    } catch {
      return false;
    }
  }

  private async crawlCategory(
    page: Page, storeId: number, categoryName: string, url: string,
  ): Promise<CrawlResult> {
    const result: CrawlResult = { store: this.storePrettyName, category: categoryName, products: [], errors: [] };

    try {
      await this.throttle();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);

      const products = await this.extractProducts(page);
      const categoryId = await getOrCreateCategory(storeId, categoryName, url);

      for (const p of products) {
        try {
          const pd = this.makeProduct({
            storeId, categoryId, name: p.name, unit: p.unit, price: p.price,
            imageUrl: p.imageUrl, productUrl: p.productUrl || url, sku: p.sku,
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

  private async extractProducts(page: Page): Promise<{ name: string; unit: string; price: number; imageUrl: string | null; productUrl: string | null; sku: string }[]> {
    return await page.evaluate(() => {
      const items: any[] = [];

      const productCards = document.querySelectorAll(
        '[class*="product"], [class*="Product"], [class*="card"], [class*="Card"], .item, li'
      );

      productCards.forEach((el) => {
        const text = (el as HTMLElement).innerText?.trim() || '';
        if (text.length < 10) return;

        const name = el.querySelector(
          '[class*="name"], [class*="Name"], [class*="title"], [class*="Title"], h2, h3, h4, strong'
        )?.textContent?.trim() || '';

        const priceText = el.querySelector(
          '[class*="price"], [class*="Price"], .amount, [class*="amount"]'
        )?.textContent?.trim() || '';

        const img = el.querySelector('img')?.getAttribute('src')
          || el.querySelector('img')?.getAttribute('data-src') || null;

        const link = el.querySelector('a')?.getAttribute('href') || null;

        if (!name || name.length < 3) return;

        const priceMatch = priceText.match(/₱?([\d,]+(?:\.\d{2})?)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;

        if (!price) return;

        let unit = '';
        const unitPatterns = [/([\d.]+)\s*(kg|g|ml|l|L|pcs|pack)\b/i];
        for (const p of unitPatterns) {
          const m = name.match(p) || text.match(p);
          if (m) { unit = m[0]; break; }
        }

        items.push({
          name: name.replace(/\s+/g, ' ').trim(),
          unit,
          price,
          imageUrl: img,
          productUrl: link?.startsWith('http') ? link : link ? `https://www.super8.ph${link}` : null,
          sku: `super8-${name.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50)}-${price}`,
        });
      });

      return items;
    });
  }
}
