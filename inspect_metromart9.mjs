import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://www.metromart.com/shops/sm-supermarket-makati', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(5000);

const cookies = await page.context().cookies();
const token = cookies.find(c => c.name === 'token')?.value;

// Get all fields (don't restrict with fields[])
const result = await page.evaluate(async (tok) => {
  const resp = await fetch(
    'https://api.metromart.com/api/v2/products?filter[shop-id]=2109&filter[department-id]=43881&page[number]=1&page[size]=2',
    { headers: { 'Authorization': `Token ${tok}`, 'Accept': 'application/json' } }
  );
  return resp.json();
}, token);

if (result.data?.length > 0) {
  const attrs = result.data[0].attributes;
  console.log('All attributes:', JSON.stringify(attrs, null, 2));
  console.log('\nAttribute keys:', Object.keys(attrs));
}

// Also check if weights/included has unit info
const result2 = await page.evaluate(async (tok) => {
  const resp = await fetch(
    'https://api.metromart.com/api/v2/products?filter[shop-id]=2109&filter[department-id]=43881&page[number]=1&page[size]=2&include=weights',
    { headers: { 'Authorization': `Token ${tok}`, 'Accept': 'application/json' } }
  );
  return resp.json();
}, token);

if (result2.included?.length > 0) {
  const types = {};
  result2.included.forEach(i => { types[i.type] = (types[i.type] || 0) + 1; });
  console.log('\nIncluded types:', JSON.stringify(types));
  
  const weights = result2.included.filter(i => i.type === 'weights');
  if (weights.length > 0) {
    console.log('\nSample weight:', JSON.stringify(weights[0].attributes));
  }
  
  const productRels = result2.included.filter(i => i.type === 'products');
  if (productRels.length > 0) {
    console.log('\nSample product included:', JSON.stringify(productRels[0].attributes).substring(0, 500));
  }
}

await browser.close();
