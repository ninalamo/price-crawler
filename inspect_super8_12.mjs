import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);

// Get CSRF token from cookies/meta tag
const csrfInfo = await page.evaluate(() => {
  // Laravel puts CSRF in meta tag
  const meta = document.querySelector('meta[name="csrf-token"]');
  // Or in a cookie
  const cookies = document.cookie.split(';').map(c => c.trim());
  const csrfCookie = cookies.find(c => c.startsWith('XSRF-TOKEN='));
  
  return {
    metaCsrf: meta?.getAttribute('content') || null,
    csrfCookie: csrfCookie ? csrfCookie.substring(11) : null,
  };
});

console.log('CSRF info:', JSON.stringify(csrfInfo));

// Get the CSRF cookie value properly
const cookies = await page.context().cookies();
const xsrfCookie = cookies.find(c => c.name === 'XSRF-TOKEN');
const laravelSession = cookies.find(c => c.name === 'laravel_session');
console.log('XSRF cookie:', xsrfCookie?.value?.substring(0, 30));
console.log('Session cookie:', laravelSession?.value?.substring(0, 30));

// Now try the set-branch API directly with proper CSRF
const result = await page.evaluate(async () => {
  const meta = document.querySelector('meta[name="csrf-token"]');
  const token = meta?.getAttribute('content') || '';
  
  try {
    const resp = await fetch('/branches/set-branch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': token,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({
        province_code: '133900000',
        city_code: '137602000',
        brgy_code: '137602001',
        branch_id: '2', // Try common branch IDs
      }),
    });
    const text = await resp.text();
    return { status: resp.status, body: text.substring(0, 500) };
  } catch (e) {
    return { error: e.message };
  }
});

console.log('Set branch result:', JSON.stringify(result));

// If successful, reload the products page
if (result.status === 200) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  
  const state = await page.evaluate(() => {
    const products = document.querySelectorAll('[class*="product"], .item, [class*="card"]');
    const imgs = document.querySelectorAll('img[src*="product"]');
    const branchText = document.querySelector('[class*="branch"], [class*="Branch"]');
    return {
      products: products.length,
      productImages: imgs.length,
      branch: branchText?.textContent?.trim() || 'no branch element',
      preview: document.body.innerText.substring(0, 500),
    };
  });
  console.log('After reload:', JSON.stringify(state, null, 2));
}

await browser.close();
