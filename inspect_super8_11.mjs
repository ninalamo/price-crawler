import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);

// Check what JS handlers are on the Go button
const goBtnInfo = await page.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  let goBtn = null;
  for (const b of buttons) {
    if (b.textContent.trim() === 'Go') {
      goBtn = b;
      break;
    }
  }
  
  if (!goBtn) return { error: 'go button not found' };
  
  // Get event listeners (Chrome DevTools Protocol only shows some)
  const info = {
    id: goBtn.id,
    className: goBtn.className,
    type: goBtn.type,
    disabled: goBtn.disabled,
    outerHtml: goBtn.outerHTML.substring(0, 300),
    onclick: goBtn.getAttribute('onclick'),
    vueEvents: Object.keys(goBtn).filter(k => k.startsWith('__vue')),
  };
  
  // Check parent elements for onclick
  let parent = goBtn.parentElement;
  let depth = 0;
  while (parent && depth < 5) {
    const pOnClick = parent.getAttribute('onclick');
    if (pOnClick) {
      info['parent_' + depth + '_onclick'] = pOnClick;
    }
    parent = parent.parentElement;
    depth++;
  }
  
  return info;
});

console.log('Go button info:', JSON.stringify(goBtnInfo, null, 2));

// Capture network activity when clicking Go
const networkCalls = [];
page.on('request', req => {
  if (req.method() === 'POST' || req.url().includes('branch') || req.url().includes('coverage')) {
    networkCalls.push({ url: req.url().substring(0, 200), method: req.method() });
  }
});

// Set values and click Go via dispatchEvent (proper event simulation)
await page.evaluate(async () => {
  const $ = jQuery;
  
  // Set province
  $('select.select2-hidden-accessible').eq(1).val('133900000').trigger('change');
  await new Promise(r => setTimeout(r, 2000));
  
  // Set city
  $('select.select2-hidden-accessible').eq(2).val('137602000').trigger('change');
  await new Promise(r => setTimeout(r, 2000));
  
  // Set barangay
  $('select.select2-hidden-accessible').eq(3).val('137602001').trigger('change');
  await new Promise(r => setTimeout(r, 1000));
  
  // Click Go via mouse event (more reliable than .click())
  const buttons = document.querySelectorAll('button');
  for (const b of buttons) {
    if (b.textContent.trim() === 'Go') {
      // Dispatch a proper MouseEvent
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      b.dispatchEvent(event);
      break;
    }
  }
});

await page.waitForTimeout(5000);

console.log('\nNetwork calls after Go:');
networkCalls.forEach(c => console.log(`  ${c.method} ${c.url}`));

const pageState = await page.evaluate(() => {
  return {
    url: window.location.href,
    products: document.querySelectorAll('[class*="product"], .item, [class*="card"]').length,
    bodyText: document.body.innerText.substring(0, 500),
  };
});
console.log('\nPage state:', JSON.stringify(pageState, null, 2));

await browser.close();
