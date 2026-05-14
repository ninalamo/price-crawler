import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);

// Full flow: fetch branches, then set branch, then reload
const result = await page.evaluate(async () => {
  const meta = document.querySelector('meta[name="csrf-token"]');
  const token = meta?.getAttribute('content') || '';
  
  // Step 1: Fetch branches for Metro Manila / Makati
  const fetchResp = await fetch('/branches/fetch-branch-coverage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': token,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ province_code: '133900000', city_code: '137602000' }),
  });
  const fetchData = await fetchResp.json();
  
  // Step 2: Find the branch for Makati
  const branches = fetchData.branches || fetchData.data || [];
  
  return {
    fetchStatus: fetchResp.status,
    fetchData: JSON.parse(JSON.stringify(fetchData)).substring?.(0, 2000) || JSON.stringify(fetchData).substring(0, 2000),
  };
});

console.log('Fetch branches result:', JSON.stringify(result, null, 2));

await browser.close();
