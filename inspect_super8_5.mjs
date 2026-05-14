import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Capture network requests
const apiCalls = [];
page.on('request', req => {
  if (req.url().includes('super8') && (req.url().includes('/api/') || req.url().includes('branch') || req.url().includes('city') || req.url().includes('province'))) {
    apiCalls.push({ url: req.url().substring(0, 300), method: req.method() });
  }
});

page.setViewportSize({ width: 1280, height: 800 });
await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

// Get Select2 config for the city select
const select2Config = await page.evaluate(() => {
  var $citySelect = jQuery('select.select2-hidden-accessible').eq(2);
  var data = $citySelect.data('select2');
  if (data && data.options) {
    return {
      ajax: data.options.ajax ? {
        url: data.options.ajax.url,
        dataType: data.options.ajax.dataType,
        delay: data.options.ajax.delay,
        data: data.options.ajax.data ? data.options.ajax.data.toString() : null,
        processResults: data.options.ajax.processResults ? 'function exists' : null,
      } : null,
      placeholder: data.options.placeholder,
      allowClear: data.options.allowClear,
      minimumInputLength: data.options.minimumInputLength,
    };
  }
  return { error: 'no select2 data', html: $citySelect[0]?.outerHTML?.substring(0, 500) };
});

console.log('City Select2 config:', JSON.stringify(select2Config, null, 2));

// Try clicking the province via UI, then capture API calls
apiCalls.length = 0;
const containers = await page.locator('.select2-container').all();

// Open province dropdown
await containers[1].click();
await page.waitForTimeout(500);

// Click Metro Manila
const options = await page.locator('.select2-results__option').all();
for (const opt of options) {
  const text = await opt.textContent();
  if (text?.trim() === 'Metro Manila') {
    await opt.click();
    break;
  }
}

await page.waitForTimeout(3000);

console.log('\nAPI calls after province select:');
apiCalls.forEach(c => console.log(`  ${c.method} ${c.url}`));

// Check current select2 state
const state = await page.evaluate(() => {
  var $province = jQuery('select.select2-hidden-accessible').eq(1);
  var $city = jQuery('select.select2-hidden-accessible').eq(2);
  return {
    provinceVal: $province.val(),
    provinceText: $province.find('option:selected').text(),
    cityOptions: Array.from($city[0].options).map(function(o) { return o.text; }),
    cityVal: $city.val(),
  };
});
console.log('\nState:', JSON.stringify(state, null, 2));

await browser.close();
