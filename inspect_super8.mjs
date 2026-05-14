import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('=== Super8 /products ===');
await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(5000);

const modalChecks = await page.evaluate(() => {
  const results = {};
  const overlays = document.querySelectorAll('[class*="overlay"], [class*="modal"], [class*="Modal"], [class*="dialog"], [role="dialog"]');
  results.overlayCount = overlays.length;
  results.overlays = Array.from(overlays).map(o => ({
    tag: o.tagName,
    classes: (o.className || '').substring(0, 100),
    visible: o.getAttribute('style') || 'no style attr',
    text: (o.textContent || '').substring(0, 200)
  }));

  results.buttons = Array.from(document.querySelectorAll('button')).map(b => ({
    text: (b.textContent || '').substring(0, 80),
    classes: (b.className || '').substring(0, 80),
    id: b.id?.substring(0, 40),
    type: b.type,
  }));

  results.selects = Array.from(document.querySelectorAll('select')).map(s => ({
    name: s.name,
    id: s.id,
    options: Array.from(s.options).map(o => o.text).slice(0, 10),
  }));

  results.links = Array.from(document.querySelectorAll('a[href*="branch"], a[href*="Branch"], a[href*="location"], a[href*="Location"], a[href*="city"], a[href*="store"]')).slice(0, 10).map(a => ({
    text: (a.textContent || '').substring(0, 60),
    href: (a.getAttribute('href') || '').substring(0, 100),
  }));

  const productEls = document.querySelectorAll('[class*="product"], [class*="Product"], .item, [class*="card"]');
  results.productCount = productEls.length;

  return results;
});

console.log(JSON.stringify(modalChecks, null, 2));

// Try clicking every button to see if one dismisses the modal
console.log('\n=== Trying to dismiss modals ===');
for (const btn of modalChecks.buttons) {
  try {
    const els = await page.locator(`button:has-text("${btn.text.substring(0, 20)}")`).all();
    for (const el of els) {
      if (await el.isVisible()) {
        await el.click();
        await page.waitForTimeout(500);
        console.log(`Clicked: "${btn.text.substring(0, 40)}"`);
      }
    }
  } catch {}
}

await page.waitForTimeout(2000);

const after = await page.evaluate(() => {
  const productEls = document.querySelectorAll('[class*="product"], [class*="Product"], .item, [class*="card"]');
  return {
    bodyLength: document.body.innerText.length,
    productCount: productEls.length,
    pageContent: document.body.innerText.substring(0, 1000),
  };
});
console.log(JSON.stringify(after, null, 2));

await browser.close();
