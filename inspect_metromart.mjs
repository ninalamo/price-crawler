import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Intercept XHR/Fetch requests to find API calls
const apiCalls = [];
page.on('request', req => {
  if (req.url().includes('api.metromart.com') || req.url().includes('/api/')) {
    apiCalls.push({ url: req.url().substring(0, 200), method: req.method(), type: req.resourceType() });
  }
});

console.log('=== MetroMart SM Supermarket Makati ===');
await page.goto('https://www.metromart.com/shops/sm-supermarket-makati', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(5000);

const info = await page.evaluate(() => {
  const results = {};
  const productEls = document.querySelectorAll('[class*="product"]');
  results.productElements = productEls.length;
  results.sampleProducts = Array.from(productEls).slice(0, 5).map(el => ({
    classes: (el.className || '').substring(0, 120),
    text: (el.textContent || '').substring(0, 80),
    tag: el.tagName,
  }));

  const buttons = document.querySelectorAll('button, a[class*="load"], a[class*="Load"], [class*="load"], [class*="Load"]');
  results.loadButtons = Array.from(buttons).filter(b => {
    const t = (b.textContent || '').toLowerCase();
    return t.includes('load') || t.includes('more') || t.includes('view');
  }).map(b => ({
    text: (b.textContent || '').substring(0, 80),
    classes: (b.className || '').substring(0, 80),
    tag: b.tagName,
  }));

  results.allButtons = Array.from(document.querySelectorAll('button')).slice(0, 20).map(b => ({
    text: (b.textContent || '').substring(0, 80),
    classes: (b.className || '').substring(0, 80),
  }));

  const deptLinks = document.querySelectorAll('a[href*="/departments/"]');
  results.departmentLinks = Array.from(deptLinks).map(a => ({
    text: (a.textContent || '').substring(0, 60),
    href: (a.getAttribute('href') || '').substring(0, 100),
  })).slice(0, 15);
  results.departmentCount = deptLinks.length;

  return results;
});

console.log(JSON.stringify(info, null, 2));

// Now inspect a department page with API interception
console.log('\n=== MetroMart Department Page with API tracking ===');
apiCalls.length = 0;
await page.goto('https://www.metromart.com/shops/sm-supermarket-makati/departments/569-fruits-and-vegetables', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(5000);

const deptInfo = await page.evaluate(() => {
  const results = {};
  const productEls = document.querySelectorAll('[class*="product"]');
  results.productElements = productEls.length;
  results.sampleProducts = Array.from(productEls).slice(0, 5).map(el => ({
    classes: (el.className || '').substring(0, 120),
    text: (el.textContent || '').substring(0, 100),
  }));

  const loadMore = document.querySelectorAll('[class*="load"], [class*="Load"], [class*="pagination"], [class*="Pagination"], [class*="infinite"], [class*="Infinite"], [class*="more"], [class*="More"]');
  results.loadMoreElements = Array.from(loadMore).map(el => ({
    tag: el.tagName,
    classes: (el.className || '').substring(0, 100),
    text: (el.textContent || '').substring(0, 100),
  }));

  const imgs = document.querySelectorAll('img');
  results.totalImages = imgs.length;
  results.visibleImages = Array.from(imgs).filter(i => {
    const rect = i.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }).length;

  return results;
});

console.log(JSON.stringify(deptInfo, null, 2));
console.log('\nAPI calls intercepted:');
console.log(JSON.stringify(apiCalls, null, 2));

// Try scrolling more aggressively
console.log('\n=== Scrolling aggressively ===');
for (let i = 0; i < 20; i++) {
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(300);
}
await page.waitForTimeout(2000);

const afterScroll = await page.evaluate(() => {
  const productEls = document.querySelectorAll('[class*="product"]');
  const imgs = document.querySelectorAll('img');
  return {
    productElements: productEls.length,
    totalImages: imgs.length,
    visibleImages: Array.from(imgs).filter(i => {
      const rect = i.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    }).length,
    bodyHeight: document.body.scrollHeight,
  };
});

console.log(JSON.stringify(afterScroll, null, 2));
console.log('\nAPI calls after scroll:');
console.log(JSON.stringify(apiCalls, null, 2));

await browser.close();
