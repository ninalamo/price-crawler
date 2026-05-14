import { Page } from 'playwright';
import { BaseCrawler } from './base.js';
import { CrawlResult } from '../types.js';
import { getOrCreateStore, getOrCreateCategory, upsertProduct } from '../db/index.js';

interface MetroDepartment {
  id: string;
  name: string;
  productCount: number;
}

interface MetroProduct {
  name: string;
  size: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  sku: string;
  status: string;
}

const TARGET_SHOPS = [
  { id: 2109, name: 'SM Supermarket' },
  { id: 135, name: 'Robinsons Supermarket' },
  { id: 117, name: 'Shopwise' },
  { id: 240, name: 'Landmark' },
  { id: 155, name: "S&R" },
];

export class MetroMartCrawler extends BaseCrawler {
  constructor() {
    super('MetroMart', 'https://www.metromart.com');
  }

  get storePrettyName(): string {
    return 'MetroMart';
  }

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    const page = await this.newPage();

    try {
      // Visit homepage once to get a guest auth token
      console.log('  [MetroMart] Getting session token...');
      await this.throttle();
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      const token = await this.getToken(page);
      if (!token) {
        console.log('  [MetroMart] Failed to get auth token');
        return results;
      }

      // Crawl each target shop via API
      for (const shop of TARGET_SHOPS) {
        console.log(`  [MetroMart] ${shop.name}...`);
        const result = await this.crawlShop(page, shop, token);
        if (result.products.length > 0 || result.errors.length > 0) {
          results.push(result);
        }
      }
    } finally {
      await page.close();
    }

    return results;
  }

  private async getToken(page: Page): Promise<string> {
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find(c => c.name === 'token');
    return tokenCookie?.value || '';
  }

  private async crawlShop(
    page: Page, shop: { id: number; name: string }, token: string,
  ): Promise<CrawlResult> {
    const result: CrawlResult = {
      store: this.storePrettyName,
      category: shop.name,
      products: [],
      errors: [],
    };

    try {
      const departments = await this.fetchDepartments(page, token, shop.id);
      console.log(`    -> ${departments.length} departments found (~${departments.reduce((s, d) => s + d.productCount, 0)} products)`);

      for (const dept of departments) {
        const deptResult = await this.crawlDepartment(page, shop, dept, token);
        result.products.push(...deptResult.products);
        result.errors.push(...deptResult.errors);
        await this.throttle();
      }

      console.log(`    -> ${shop.name}: ${result.products.length} products total`);
    } catch (err: any) {
      result.errors.push(`Shop "${shop.name}": ${err.message}`);
    }

    return result;
  }

  private async fetchDepartments(
    page: Page, token: string, shopId: number,
  ): Promise<MetroDepartment[]> {
    const data = await page.evaluate(async (args) => {
      const resp = await fetch(
        `https://api.metromart.com/api/v2/departments?filter[shop-id]=${args.shopId}&filter[product.status]=available&fields[departments]=name,available-products-count,priority&page[size]=100`,
        {
          headers: { 'Authorization': `Token ${args.token}`, 'Accept': 'application/json' },
        },
      );
      if (!resp.ok) return [];
      const json = await resp.json();
      return (json.data || []).map((d: any) => ({
        id: d.id,
        name: d.attributes?.name || '',
        productCount: d.attributes?.['available-products-count'] || 0,
      })).filter((d: MetroDepartment) => d.name && d.productCount > 0);
    }, { token, shopId });

    return data || [];
  }

  private async crawlDepartment(
    page: Page, shop: { id: number; name: string }, dept: MetroDepartment, token: string,
  ): Promise<CrawlResult> {
    const result: CrawlResult = {
      store: `${this.storePrettyName} - ${shop.name}`,
      category: dept.name,
      products: [],
      errors: [],
    };

    const store = await getOrCreateStore('MetroMart', this.baseUrl);
    const storeId = store.id;
    const categoryUrl = `https://www.metromart.com/shops/${this.getShopSlug(shop.id)}/departments/${dept.id}`;
    const categoryId = await getOrCreateCategory(storeId, `${shop.name} - ${dept.name}`, categoryUrl);

    try {
      let pageNum = 1;
      let totalFetched = 0;

      while (true) {
        const products = await this.fetchProducts(page, token, shop.id, dept.id, pageNum);
        if (!products || products.length === 0) break;

        for (const p of products) {
          try {
            const pd = this.makeProduct({
              storeId,
              categoryId,
              name: p.name,
              unit: p.size || null,
              price: p.price,
              originalPrice: p.originalPrice,
              imageUrl: p.imageUrl,
              productUrl: categoryUrl,
              sku: p.sku,
            });
            await upsertProduct(pd, this.crawlSessionId);
            result.products.push(pd);
          } catch (err: any) {
            result.errors.push(`Save "${p.name}": ${err.message}`);
          }
        }

        totalFetched += products.length;

        if (products.length < 100) break;
        pageNum++;
        await this.throttle();
      }

      if (totalFetched > 0) {
        console.log(`      ${dept.name}: ${totalFetched} products`);
      }
    } catch (err: any) {
      result.errors.push(`Department "${dept.name}": ${err.message}`);
    }

    return result;
  }

  private async fetchProducts(
    page: Page, token: string, shopId: number, deptId: string, pageNum: number,
  ): Promise<MetroProduct[] | null> {
    const data = await page.evaluate(async (args) => {
      const resp = await fetch(
        `https://api.metromart.com/api/v2/products?filter[shop-id]=${args.shopId}&filter[department-id]=${args.deptId}&page[number]=${args.pageNum}&page[size]=100&fields[products]=name,size,amount-in-cents,base-amount-in-cents,external-sku,image-url,status`,
        {
          headers: { 'Authorization': `Token ${args.token}`, 'Accept': 'application/json' },
        },
      );
      if (!resp.ok) return [];
      const json = await resp.json();
      return (json.data || []).map((p: any) => {
        const a = p.attributes || {};
        return {
          name: a.name || '',
          size: a.size || '',
          price: (a['amount-in-cents'] || 0) / 100,
          originalPrice: a['base-amount-in-cents'] ? (a['base-amount-in-cents'] / 100) : null,
          imageUrl: a['image-url'] || null,
          sku: `metromart-${a['external-sku'] || p.id}`,
          status: a.status || 'unknown',
        };
      }).filter((p: MetroProduct) => p.name && p.price > 0);
    }, { token, shopId, deptId, pageNum });

    return data || null;
  }

  private getShopSlug(shopId: number): string {
    const slugs: Record<number, string> = {
      2109: 'sm-supermarket-makati',
      135: 'robinsons-supermarket-california-garden',
      117: 'shopwise-makati',
      240: 'landmark-makati',
      155: 'snr-circuit',
    };
    return slugs[shopId] || `shop-${shopId}`;
  }
}
