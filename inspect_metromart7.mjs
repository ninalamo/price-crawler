import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Intercept request headers for the products API
const requestHeaders = [];
page.on('request', req => {
  if (req.url().includes('/api/v2/products') && req.method() === 'GET') {
    requestHeaders.push({
      url: req.url().substring(0, 300),
      headers: req.headers(),
    });
  }
});

await page.goto('https://www.metromart.com/shops/sm-supermarket-makati/departments/44081-fresh-vegetables', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(8000);

// Check cookies
const cookies = await page.context().cookies();
const tokenCookie = cookies.find(c => c.name === 'token');
console.log('Token cookie value:', tokenCookie?.value?.substring(0, 50) || 'not found');

if (requestHeaders.length > 0) {
  const headers = requestHeaders[0].headers;
  console.log('\nProducts API request headers:');
  Object.entries(headers).forEach(([k, v]) => {
    if (k.toLowerCase().includes('auth') || k.toLowerCase().includes('token') || k.toLowerCase().includes('cookie')) {
      console.log(`  ${k}: ${v.substring(0, 80)}`);
    }
  });
  console.log('\nAll headers:');
  Object.entries(headers).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

// Try with auth header from cookie
const token = tokenCookie?.value || '';
console.log('\n=== Trying direct API with Bearer token ===');
const result = await page.evaluate(async (t) => {
  try {
    const resp = await fetch(
      'https://api.metromart.com/api/v2/products?filter[shop-id]=2109&filter[department-id]=44081&page[number]=1&page[size]=5&include=weights&fields[products]=name,amount-in-cents,base-amount-in-cents,image-url,unit,package-size',
      { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${t}` } }
    );
    if (!resp.ok) return { error: `HTTP ${resp.status}`, text: await resp.text().then(tt => tt.substring(0, 200)) };
    return await resp.json();
  } catch (e) {
    return { error: e.message };
  }
}, token);

if (result.error) {
  console.log('Error:', result.error);
  if (result.text) console.log('Body:', result.text);
} else {
  console.log('Items:', result.data?.length);
  if (result.data?.length > 0) {
    console.log('Item attributes sample:', JSON.stringify(result.data[0].attributes));
  }
  console.log('Meta:', JSON.stringify(result.meta));
}

// Also try without Authorization via page.request
console.log('\n=== Trying via Playwright APIRequestContext ===');
const apiCtx = await page.request.context();
const apiResp = await apiCtx.get(
  'https://api.metromart.com/api/v2/products?filter[shop-id]=2109&filter[department-id]=44081&page[number]=1&page[size]=5&include=weights&fields[products]=name,amount-in-cents,base-amount-in-cents,image-url,unit,package-size'
);
console.log('Status:', apiResp.status());
if (apiResp.ok()) {
  const json = await apiResp.json();
  console.log('Items:', json.data?.length);
  if (json.data?.length > 0) console.log('Sample:', JSON.stringify(json.data[0].attributes));
} else {
  console.log('Body:', (await apiResp.text()).substring(0, 200));
}

await browser.close();
