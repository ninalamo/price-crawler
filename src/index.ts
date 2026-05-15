(process.stdout as any)._handle?.setBlocking(true);

import { PickarooCrawler } from './crawlers/pickaroo.js';
import { MetroMartCrawler } from './crawlers/metromart.js';
import { Super8Crawler } from './crawlers/super8.js';
import { BaseCrawler } from './crawlers/base.js';
import { closeDb, createCrawlSession, updateCrawlSession, getOrCreateStore, markProductsNotInSession } from './db/index.js';
import { StoreName, CrawlSession } from './types.js';

const HELP = `
PH Supermarket Price Crawler

Usage: npm run crawl -- [options]

Options:
  --stores <names>   Comma-separated: sm,shopwise,robinsons,metromart,super8 (default: all)
  --location <loc>   SM/Savemore location slug (default: "sm-savemore-shoe-ave")
  --shopwise-branch  Shopwise Pickaroo branch (default: "shopwise-commonwealth")
  --robinsons-branch Robinsons Pickaroo branch (default: "robinsons-supermarket-eastwood-technoplaza-ii")

Examples:
  npm run crawl                             Crawl all stores
  npm run crawl -- --stores sm,metromart    Crawl SM and MetroMart
  npm run crawl -- --location sm-savemore-commonwealth
`;

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--stores': result.stores = args[++i] || ''; break;
      case '--location': result.location = args[++i] || ''; break;
      case '--shopwise-branch': result.shopwiseBranch = args[++i] || ''; break;
      case '--robinsons-branch': result.robinsonsBranch = args[++i] || ''; break;
      case '--help': case '-h': console.log(HELP); process.exit(0);
    }
  }
  return result;
}

async function main(): Promise<void> {
  console.log('PH Supermarket Price Crawler\n');

  const opts = parseArgs();
  const selectedStores: StoreName[] = opts.stores
    ? opts.stores.split(',').map(s => s.trim() as StoreName)
    : ['sm', 'shopwise', 'robinsons', 'metromart', 'super8'];

  const location = opts.location || 'sm-savemore-shoe-ave';
  const shopwiseBranch = opts.shopwiseBranch || 'shopwise-commonwealth';
  const robinsonsBranch = opts.robinsonsBranch || 'robinsons-supermarket-eastwood-technoplaza-ii';

  const crawlers: { name: string; instance: BaseCrawler }[] = [];

  if (selectedStores.includes('sm')) {
    crawlers.push({
      name: 'SM Savemore',
      instance: new PickarooCrawler('SM Savemore', 'sm-markets', location),
    });
  }
  if (selectedStores.includes('shopwise')) {
    crawlers.push({
      name: 'Shopwise',
      instance: new PickarooCrawler('Shopwise', 'shopwise', shopwiseBranch),
    });
  }
  if (selectedStores.includes('robinsons')) {
    crawlers.push({
      name: 'Robinsons Supermarket',
      instance: new PickarooCrawler('Robinsons Supermarket', 'robinsons', robinsonsBranch),
    });
  }
  if (selectedStores.includes('metromart')) {
    crawlers.push({ name: 'MetroMart', instance: new MetroMartCrawler() });
  }
  if (selectedStores.includes('super8')) {
    crawlers.push({ name: 'Super8', instance: new Super8Crawler() });
  }

  if (crawlers.length === 0) {
    console.log('No stores selected. Use --stores to specify.\n');
    console.log(HELP);
    process.exit(1);
  }

  const session: CrawlSession = createCrawlSession(crawlers.map(c => c.name));
  console.log(`Session ID: ${session.id}`);

  let totalProducts = 0;
  let totalErrors = 0;
  const crawledStoreIds: number[] = [];

  for (const { name, instance } of crawlers) {
    console.log(`\n=== ${name} ===`);
    try {
      instance.setSession(session.id);
      if (name === 'MetroMart' || name === 'Super8') {
        instance.setThrottle(500);
      } else {
        instance.setThrottle(0);
      }
      await instance.init();
      const results = await instance.crawl();
      await instance.destroy();

      for (const r of results) {
        totalProducts += r.products.length;
        totalErrors += r.errors.length;
        if (r.errors.length > 0) {
          for (const err of r.errors) {
            console.log(`  [!] ${r.category}: ${err}`);
          }
        }
      }

      // Mark products from this store not seen in this session as unavailable
      const store = await getOrCreateStore(name);
      crawledStoreIds.push(store.id);
      const marked = await markProductsNotInSession(session.id, [store.id]);
      if (marked > 0) console.log(`  Marked ${marked} products as unavailable (not seen this crawl)`);
    } catch (err: any) {
      console.log(`  [ERROR] Crawler failed: ${err.message}`);
      totalErrors++;
    }
  }

  await updateCrawlSession(session.id, 'completed', totalProducts, totalErrors);

  console.log(`\n=== Done ===`);
  console.log(`Session ID: ${session.id}`);
  console.log(`Total products saved: ${totalProducts}`);
  if (totalErrors > 0) console.log(`Total errors: ${totalErrors}`);

  // Notify subscribers if API is available
  const apiUrl = process.env.API_URL || 'http://localhost:4000';
  const storeNames = crawlers.map(c => c.name).join(', ');
  try {
    const resp = await fetch(`${apiUrl}/api/notifications/crawl-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'price-crawler-internal' },
      body: JSON.stringify({ session_id: session.id, store_names: storeNames, total_products: totalProducts }),
    });
    if (resp.ok) {
      const result = await resp.json();
      if (result.notified > 0) console.log(`Notified ${result.notified} subscriber(s)`);
    }
  } catch { /* API might not be running */ }

  await closeDb();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeDb();
  process.exit(1);
});
