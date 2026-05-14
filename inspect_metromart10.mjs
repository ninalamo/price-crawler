import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://www.metromart.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(5000);

const cookies = await page.context().cookies();
const token = cookies.find(c => c.name === 'token')?.value;

const shops = [
  { id: 2109, name: 'SM Supermarket' },
  { id: 135, name: 'Robinsons Supermarket' },
  { id: 117, name: 'Shopwise' },
  { id: 240, name: 'Landmark' },
  { id: 155, name: "S&R" },
];

for (const shop of shops) {
  const result = await page.evaluate(async (args) => {
    const resp = await fetch(
      `https://api.metromart.com/api/v2/departments?filter[shop-id]=${args.shopId}&filter[product.status]=available&fields[departments]=name,available-products-count,priority&page[size]=100`,
      { headers: { 'Authorization': `Token ${args.token}`, 'Accept': 'application/json' } }
    );
    return resp.json();
  }, { token, shopId: shop.id });

  const depts = result.data || [];
  const withProducts = depts.filter(d => (d.attributes?.['available-products-count'] || 0) > 0);
  const totalProducts = withProducts.reduce((sum, d) => sum + (d.attributes?.['available-products-count'] || 0), 0);
  console.log(`\n${shop.name} (${shop.id}): ${withProducts.length} departments, ~${totalProducts} products`);
  withProducts.slice(0, 5).forEach(d => console.log(`  ID:${d.id} ${d.attributes.name} (${d.attributes['available-products-count']})`));
}

await browser.close();
