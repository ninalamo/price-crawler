import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const allResponses = [];
page.on('response', async resp => {
  const url = resp.url();
  if (url.includes('api.metromart.com') && resp.status() === 200 && (url.includes('/items') || url.includes('/departments') || url.includes('/products'))) {
    try {
      const json = await resp.json();
      const dataCount = json.data?.length || 0;
      allResponses.push({ url: url.substring(0, 300), dataCount, type: json.data?.[0]?.type || 'unknown' });
      if (url.includes('/items') && dataCount > 0) {
        console.log('\n=== ITEMS WITH DATA! ===');
        console.log('URL:', url.substring(0, 400));
        console.log('First item:', JSON.stringify(json.data[0]).substring(0, 1000));
        console.log('Meta:', JSON.stringify(json.meta));
        if (json.included?.length) {
          const product = json.included.find(i => i.type === 'product');
          if (product) console.log('Product attrs:', JSON.stringify(product.attributes).substring(0, 500));
        }
      }
    } catch {}
  }
});

// Use correct URL format: /departments/{id}-{name}
console.log('=== Navigating to correct department URL ===');
await page.goto('https://www.metromart.com/shops/sm-supermarket-makati/departments/44081-fresh-vegetables', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(5000);

console.log('\nPage URL:', page.url());

// Check the page content
const text = await page.evaluate(() => document.body.innerText.substring(0, 1000));
console.log('\nPage text:', text);

console.log('\n=== All API responses captured ===');
allResponses.forEach(r => console.log(`  [${r.type}] count=${r.dataCount} url=${r.url}`));

// Try also the items API directly via fetch in page context
console.log('\n=== Direct items API call ===');
const result = await page.evaluate(async () => {
  const resp = await fetch('https://api.metromart.com/api/v1/items?include=product.weights,product.take-y-weight,shop,product.fmcg-campaign.fmcg-campaign-vouchers&filter[shop.id]=2109&filter[department.id]=44081&filter[status]=available&page[number]=1&page[size]=10');
  return resp.json();
});
console.log('Items count:', result.data?.length);
if (result.data?.length > 0) {
  console.log('Sample item:', JSON.stringify(result.data[0]).substring(0, 800));
  console.log('Sample included product:', JSON.stringify(result.included?.find(i => i.type === 'product')).substring(0, 500));
}
console.log('Meta:', JSON.stringify(result.meta));

await browser.close();
