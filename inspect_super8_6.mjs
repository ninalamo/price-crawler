import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

const apiCalls = [];
page.on('request', req => {
  if (req.url().includes('/branches/') || req.url().includes('/api/')) {
    apiCalls.push({ url: req.url().substring(0, 300), method: req.method(), body: req.postData()?.substring(0, 200) });
  }
});

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

// Select province: click Metro Manila via Select2 UI
const containers = await page.locator('.select2-container').all();
await containers[1].click();
await page.waitForTimeout(300);
const options = await page.locator('.select2-results__option').all();
for (const opt of options) {
  const text = await opt.textContent();
  if (text?.trim() === 'Metro Manila') {
    await opt.click();
    break;
  }
}
await page.waitForTimeout(2000);

// Select city: click Makati City
const cityOptions = await page.locator('.select2-results__option').all();
// We need to open the city dropdown first
await containers[2].click();
await page.waitForTimeout(500);
const cityResults = await page.locator('.select2-results__option').all();
for (const opt of cityResults) {
  const text = await opt.textContent();
  if (text?.trim() === 'Makati City') {
    await opt.click();
    break;
  }
}
await page.waitForTimeout(2000);

// Check if barangay options appear
const barangayState = await page.evaluate(() => {
  const $brgy = jQuery('select.select2-hidden-accessible').eq(3);
  return {
    barangayOptions: Array.from($brgy[0].options).map(function(o) { return o.text; }),
    barangayCount: $brgy[0].options.length,
  };
});
console.log('Barangay after city select:', JSON.stringify(barangayState));

// If barangay exists, select first one
if (barangayState.barangayCount > 1) {
  const containers2 = await page.locator('.select2-container').all();
  await containers2[3].click();
  await page.waitForTimeout(300);
  const brgyResults = await page.locator('.select2-results__option').all();
  const firstBrgy = brgyResults.find(async (opt) => {
    const text = await opt.textContent();
    return text?.trim() !== 'Select Branch';
  });
  if (firstBrgy) {
    const text = await firstBrgy.textContent();
    console.log(`Selecting barangay: ${text?.trim()}`);
    await firstBrgy.click();
    await page.waitForTimeout(1000);
  }
}

// Click Go
await page.click('button:has-text("Go")');
console.log('Clicked Go');
await page.waitForTimeout(5000);

// Check results
const afterGo = await page.evaluate(() => {
  const products = document.querySelectorAll('[class*="product"], [class*="Product"], .item, [class*="card"]');
  const productCards = document.querySelectorAll('.product-card, [class*="product-card"], [class*="product-item"], .item-product');
  const allImgs = document.querySelectorAll('img');
  const visibleModals = document.querySelectorAll('.modal.show, .modal.fade.show');
  return {
    productCount: products.length,
    productCards: productCards.length,
    images: allImgs.length,
    visibleModals: visibleModals.length,
    url: window.location.href,
    bodyPreview: document.body.innerText.substring(0, 500),
    selectCount: jQuery('select.select2-hidden-accessible').length,
  };
});
console.log('\nAfter Go:', JSON.stringify(afterGo, null, 2));

console.log('\nAPI calls:');
apiCalls.forEach(c => console.log(`  ${c.method} ${c.url}`));

await browser.close();
