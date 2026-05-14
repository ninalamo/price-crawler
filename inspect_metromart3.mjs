import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const captured = {};
page.on('response', async resp => {
  const url = resp.url();
  try {
    if (url.includes('/api/v2/departments')) {
      captured.departments = await resp.json();
      console.log('DEPARTMENTS API captured!');
    }
    if (url.includes('/api/v1/items')) {
      captured.items = await resp.json();
      console.log('ITEMS API captured!');
    }
    if (url.includes('/api/v2/shops/')) {
      captured.shop = await resp.json();
      console.log('SHOP API captured!');
    }
  } catch {}
});

console.log('=== Visit SM Supermarket Makati shop page ===');
await page.goto('https://www.metromart.com/shops/sm-supermarket-makati', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(5000);

if (captured.shop) {
  console.log('\nShop data ID:', captured.shop.data?.id);
}

if (captured.departments) {
  const deps = captured.departments.data || [];
  console.log(`\nFound ${deps.length} departments:`);
  deps.forEach(d => console.log(`  ID: ${d.id}, Name: ${d.attributes?.name || d.name}`));
} else {
  console.log('\nNo departments captured. Trying alternative URL...');
}

// Try a different shop URL pattern that might trigger API calls
console.log('\n=== Visit shop with /store/ prefix ===');
await page.goto('https://www.metromart.com', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

// Dismiss any dialogs
await page.evaluate(() => {
  document.querySelectorAll('button').forEach(b => {
    const t = (b.textContent || '').toLowerCase();
    if (t.includes('dismiss') || t.includes('change address') || t.includes('got it')) b.click();
  });
});
await page.waitForTimeout(1000);

// Now navigate to shop
await page.goto('https://www.metromart.com/shops/sm-supermarket-makati', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(8000);

if (captured.departments) {
  const deps = captured.departments.data || [];
  console.log(`\nFound ${deps.length} departments (2nd attempt):`);
  deps.forEach(d => {
    const attrs = d.attributes || {};
    console.log(`  ID: ${d.id}, Name: ${attrs.name}, Products: ${attrs['available-products-count'] || '?'}`);
  });
} else {
  console.log('\nStill no departments. Checking page content...');
  const text = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log('Page text:', text);
}

// If we have departments, try to get items for one
if (captured.departments?.data?.length > 0) {
  const firstDept = captured.departments.data[0];
  const deptId = firstDept.id;
  const deptSlug = firstDpt.attributes?.slug || deptId;
  console.log(`\n=== Trying items API for department ${deptId} ===`);

  // Navigate to department page
  await page.goto(`https://www.metromart.com/shops/sm-supermarket-makati/departments/${deptSlug}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(5000);

  if (captured.items) {
    const items = captured.items.data || [];
    console.log(`Items API: ${items.length} products`);
    if (items.length > 0) {
      console.log('Sample item:', JSON.stringify(items[0]).substring(0, 500));
    }
    console.log('Meta:', JSON.stringify(captured.items.meta));
  } else {
    console.log('No items captured.');
    const text = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    console.log('Page text:', text);
  }
}

await browser.close();
