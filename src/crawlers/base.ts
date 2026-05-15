import { Browser, Page, chromium } from 'playwright';
import { CrawlResult, Product } from '../types.js';

export abstract class BaseCrawler {
  protected browser: Browser | null = null;
  readonly storeName: string;
  readonly baseUrl: string;
  protected crawlSessionId: string = '';
  protected requestTimestamps: number[] = [];
  protected minRequestInterval: number = 800;

  constructor(storeName: string, baseUrl: string) {
    this.storeName = storeName;
    this.baseUrl = baseUrl;
  }

  abstract get storePrettyName(): string;
  abstract crawl(): Promise<CrawlResult[]>;

  /** Set the IDs/secrets needed during crawl. Call before crawl(). */
  setSession(id: string): void {
    this.crawlSessionId = id;
  }

  /**
   * Set minimum delay (ms) between consecutive page navigations.
   * Default 800ms. Set to 0 to disable throttling.
   */
  setThrottle(ms: number): void {
    this.minRequestInterval = ms;
  }

  protected async throttle(): Promise<void> {
    if (this.minRequestInterval <= 0) return;
    const now = Date.now();
    const last = this.requestTimestamps[this.requestTimestamps.length - 1];
    if (last) {
      const elapsed = now - last;
      if (elapsed < this.minRequestInterval) {
        await this.delay(this.minRequestInterval - elapsed);
      }
    }
    this.requestTimestamps.push(Date.now());
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 30000,
    });
  }

  async newPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser not initialized');
    const page = await this.browser.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-PH,en;q=0.9,fil;q=0.8',
    });
    return page;
  }

  protected makeProduct(data: {
    storeId: number; categoryId: number | null; name: string;
    brand?: string | null; unit?: string | null; price: number;
    originalPrice?: number | null; imageUrl?: string | null;
    productUrl?: string | null; sku?: string | null;
  }): Product {
    return {
      store_id: data.storeId, category_id: data.categoryId,
      name: data.name.trim(), brand: data.brand ?? null,
      unit: data.unit ?? null, price: data.price,
      original_price: data.originalPrice ?? null, currency: 'PHP',
      image_url: data.imageUrl ?? null, product_url: data.productUrl ?? null,
      sku: data.sku ?? null, is_available: true,
    };
  }

  protected extractPrice(text: string): number {
    const match = text.replace(/[^\d.,]/g, '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }

  async destroy(): Promise<void> {
    if (this.browser) { await this.browser.close(); this.browser = null; }
  }
}
