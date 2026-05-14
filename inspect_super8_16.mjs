import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

// Brute force discover branch IDs
const result = await page.evaluate(async () => {
  const meta = document.querySelector('meta[name="csrf-token"]');
  const token = meta?.getAttribute('content') || '';
  const found = [];
  
  for (let id = 1; id <= 20; id++) {
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
          city_code: '133913000',
          brgy_code: '133913001',
          branch_id: id.toString(),
        }),
      });
      if (resp.ok) {
        const text = await resp.text();
        found.push({ id, response: text.substring(0, 200) });
      }
    } catch {}
  }
  
  return found;
});

console.log('Branch IDs found:', JSON.stringify(result, null, 2));

// Try setting with a known working branch and reload
if (result.length > 0) {
  const branchId = result[0].id;
  console.log(`\nSetting branch ${branchId} and reloading...`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  
  const state = await page.evaluate(() => {
    const products = document.querySelectorAll('[class*="product"], .item, [class*="card"]');
    const branchEl = document.querySelector('[class*="branch"]');
    return {
      url: window.location.href,
      products: products.length,
      branch: branchEl?.textContent?.trim() || 'none',
      bodyPreview: document.body.innerText.substring(0, 500),
    };
  });
  console.log('State:', JSON.stringify(state, null, 2));
}

await browser.close();
