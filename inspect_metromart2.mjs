import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Capture full request/response for items API
let itemsResponse = null;
page.on('response', async resp => {
  if (resp.url().includes('/api/v1/items')) {
    try {
      itemsResponse = await resp.json();
    } catch {}
  }
});

console.log('=== MetroMart: get session + departments + items ===');
await page.goto('https://www.metromart.com/shops/sm-supermarket-makati/departments/569-fruits-and-vegetables', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(5000);

// Check cookies
const cookies = await page.context().cookies();
const tokenCookie = cookies.find(c => c.name.includes('token') || c.name.includes('csrf') || c.name.includes('session'));
console.log('\nAuth cookies:', JSON.stringify(cookies.filter(c => c.name.includes('token') || c.name.includes('csrf') || c.name.includes('session') || c.name.includes('_ga')).map(c => ({ name: c.name, value: c.value.substring(0, 30) }))));

// Print page URL / title / content snippet
console.log('\nPage URL:', page.url());
console.log('Page title:', await page.title());

const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1500));
console.log('\nPage body text:', bodyText);

// Check if there's an error/redirect/loading
const pageState = await page.evaluate(() => ({
  readyState: document.readyState,
  scripts: document.querySelectorAll('script[src]').length,
  hasNextjs: !!document.getElementById('__NEXT_DATA__'),
  nextData: document.getElementById('__NEXT_DATA__')?.textContent?.substring(0, 500),
}));
console.log('\nPage state:', JSON.stringify(pageState, null, 2));

if (itemsResponse) {
  console.log('\nItems API response structure keys:', Object.keys(itemsResponse));
  console.log('Items count:', itemsResponse.data?.length || itemsResponse.items?.length || 'unknown');
  console.log('Sample:', JSON.stringify(itemsResponse).substring(0, 2000));
}

// Now let's try calling the API directly
console.log('\n\n=== Direct API calls ===');

// First get area info
const areaResp = await page.evaluate(async () => {
  const resp = await fetch('https://api.metromart.com/api/v1/areas/default');
  return resp.json();
}).catch(() => null);
console.log('Area default:', JSON.stringify(areaResp).substring(0, 500));

// Try the shops API
const shopResp = await page.evaluate(async () => {
  const resp = await fetch('https://api.metromart.com/api/v2/shops/sm-supermarket-makati');
  return resp.json();
}).catch(() => null);
console.log('\nShop API (first 500):', JSON.stringify(shopResp).substring(0, 500));
if (shopResp?.data) {
  console.log('Shop ID:', shopResp.data.id);
}

// Try departments API with the shop ID 2109
const deptResp = await page.evaluate(async () => {
  const resp = await fetch('https://api.metromart.com/api/v2/departments?filter[shop-id]=2109&filter[product.status]=available&page[number]=1&page[size]=100');
  return resp.json();
}).catch(() => null);
console.log('\nDepartments API:', JSON.stringify(deptResp).substring(0, 1500));

// Try items API with pagination
const itemsResp2 = await page.evaluate(async () => {
  const resp = await fetch('https://api.metromart.com/api/v1/items?include=product.weights&filter[shop.id]=2109&filter[department.id]=569&filter[status]=available&page[number]=1&page[size]=50');
  return resp.json();
}).catch(() => null);
console.log('\nItems API v1 (page 1):', JSON.stringify(itemsResp2).substring(0, 2000));

await browser.close();
