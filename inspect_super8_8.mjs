import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

// Try direct API calls to get cities and barangays
const apiData = await page.evaluate(async () => {
  try {
    // Step 1: Fetch cities for Metro Manila
    var formData = new FormData();
    formData.append('province_code', '133900000');
    // Try the endpoint we observed earlier
    var resp1 = await fetch('/branches/fetch-branch-coverage', {
      method: 'POST',
      body: formData,
    });
    var text1 = await resp1.text();
    return { raw: text1.substring(0, 2000) };
  } catch(e) {
    return { error: e.message };
  }
});

console.log('API response:', JSON.stringify(apiData, null, 2));

// Try with different content-type
const apiData2 = await page.evaluate(async () => {
  try {
    var resp = await fetch('/branches/fetch-branch-coverage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'province_code=133900000',
    });
    var text = await resp.text();
    return { data: text.substring(0, 3000) };
  } catch(e) {
    return { error: e.message };
  }
});

console.log('\nAPI response 2:', JSON.stringify(apiData2, null, 2));

await browser.close();
