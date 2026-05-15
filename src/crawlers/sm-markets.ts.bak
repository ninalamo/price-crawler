import { Page } from 'playwright';
import { BaseCrawler } from './base.js';
import { CrawlResult } from '../types.js';
import { getOrCreateStore, getOrCreateCategory, upsertProduct } from '../db/index.js';

interface SmProduct {
  name: string;
  unit: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  sku: string;
}

export class SMMarketsCrawler extends BaseCrawler {
  private location: string;

  constructor(location = 'sm-savemore-shoe-ave') {
    super('SM Savemore', 'https://pickaroo.com');
    this.location = location;
  }

  get storePrettyName(): string {
    return `SM Savemore (${this.location})`;
  }

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    const store = await getOrCreateStore('SM Savemore', this.baseUrl);
    const storeId = store.id;

    const page = await this.newPage();
    try {
      const rootUrl = `${this.baseUrl}/sm-markets/products/${this.location}`;
      console.log('  [SM] Loading page to discover categories...');
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

      console.log(`  [SM] Found ${categories.length} categories`);

      for (const cat of categories) {
        const groupParam = cat.href.match(/[?&]group=([^&]+)/)?.[1];
        if (!groupParam) continue;

        const url = `${this.baseUrl}${cat.href.startsWith('/') ? '' : '/'}${cat.href}`;
        console.log(`  [SM] ${cat.name}...`);
        const result = await this.crawlCategory(page, storeId, { slug: groupParam, name: cat.name }, url);
        results.push(result);
      }

    } finally {
      await page.close();
    }

    return results;
  }

  private async crawlCategory(
    page: Page, storeId: number, cat: { slug: string; name: string }, url: string,
  ): Promise<CrawlResult> {
    const result: CrawlResult = { store: this.storePrettyName, category: cat.name, products: [], errors: [] };

    try {
      await this.throttle();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const products = await this.extractProducts(page);
      const categoryId = await getOrCreateCategory(storeId, cat.name, url);

      for (const p of products) {
        try {
          const pd = this.makeProduct({
            storeId, categoryId, name: p.name, unit: p.unit,
            price: p.price, originalPrice: p.originalPrice, imageUrl: p.imageUrl, productUrl: url,
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
      result.errors.push(`Category "${cat.name}": ${err.message}`);
    }

    return result;
  }

  private async extractProducts(page: Page): Promise<SmProduct[]> {
    const location = this.location;
    return await page.evaluate((loc) => {
      const products: SmProduct[] = [];
      const buttons = document.querySelectorAll('button.add-to-cart-button');

      buttons.forEach((btn) => {
        const name = btn.getAttribute('data-variant-name') || '';
        const variantId = btn.getAttribute('data-variant-id') || '';
        const photo = btn.getAttribute('data-variant-photo') || '';
        const priceStr = (btn.getAttribute('data-price') || '').trim();
        const price = parseFloat(priceStr);

        if (!name || !price) return;

        let unit = '';
        let originalPrice: number | null = null;
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
          const priceLine = lines.find(l => /₱\s*[\d,]+/.test(l) && l.includes('₱'));
          if (priceLine) {
            const prices = [...priceLine.matchAll(/₱\s*([\d,]+(?:\.\d+)?)/g)].map(m => parseFloat(m[1].replace(/,/g, '')));
            const higher = prices.find(p => p > price);
            if (higher) originalPrice = higher;
          }
        }

        products.push({
          name: name.trim(),
          unit: unit || '',
          price,
          originalPrice,
          imageUrl: photo?.trim() || null,
          sku: `sm-${loc}-${variantId}`,
        });
      });

      return products;
    }, location);
  }
}
