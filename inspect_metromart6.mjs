import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// First get a session
await page.goto('https://www.metromart.com/shops/sm-supermarket-makati', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(8000);

// Now try making API calls from within the page context
const result = await page.evaluate(async () => {
  try {
    const resp = await fetch(
      'https://api.metromart.com/api/v2/products?filter[shop-id]=2109&filter[department-id]=44081&page[number]=1&page[size]=5&include=weights&fields[products]=name,amount-in-cents,base-amount-in-cents,image-url,unit,package-size,promotion-label,promotion-amount-in-cents',
      { headers: { 'Accept': 'application/json', 'Content-Type': 'application/vnd.api+json' } }
    );
    if (!resp.ok) return { error: `HTTP ${resp.status} ${resp.statusText}`, text: await resp.text().then(t => t.substring(0, 200)) };
    return await resp.json();
  } catch (e) {
    return { error: e.message };
  }
});

console.log('API call result:');
if (result.error) {
  console.log('Error:', result.error);
  if (result.text) console.log('Body:', result.text);
} else {
  console.log('Items:', result.data?.length);
  if (result.data?.length > 0) {
    const first = result.data[0];
    console.log('Item keys:', Object.keys(first));
    console.log('Item attributes:', JSON.stringify(first.attributes));
  }
  console.log('Meta:', JSON.stringify(result.meta));
  
  // Try page 2
  if (result.meta?.page) {
    const page2 = await page.evaluate(async () => {
      const resp = await fetch(
        'https://api.metromart.com/api/v2/products?filter[shop-id]=2109&filter[department-id]=44081&page[number]=2&page[size]=5&include=weights&fields[products]=name,amount-in-cents,base-amount-in-cents,image-url,unit,package-size,promotion-label,promotion-amount-in-cents',
        { headers: { 'Accept': 'application/json', 'Content-Type': 'application/vnd.api+json' } }
      );
      return resp.json();
    });
    console.log('\nPage 2 items:', page2.data?.length);
    console.log('Page 2 meta:', JSON.stringify(page2.meta));
  }
}

await browser.close();
