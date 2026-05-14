import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

// Try using jQuery/Select2 API if available, or interact via UI
const pageInfo = await page.evaluate(() => {
  const info = {};
  info.hasJQuery = typeof jQuery !== 'undefined';
  info.hasSelect2 = typeof jQuery !== 'undefined' && typeof jQuery.fn.select2 !== 'undefined';
  
  const select2Containers = document.querySelectorAll('.select2-container');
  info.select2Containers = select2Containers.length;
  info.select2Html = Array.from(select2Containers).slice(0, 4).map(function(el) {
    return {
      classes: el.className,
      id: el.id,
      text: (el.textContent || '').substring(0, 100),
    };
  });
  
  if (typeof jQuery !== 'undefined') {
    var $sel = jQuery('select.select2-hidden-accessible');
    info.selectCount = $sel.length;
    info.selectData = Array.from($sel).map(function(el, i) {
      var $el = jQuery(el);
      return {
        index: i,
        val: $el.val(),
        select2Data: $el.data('select2') ? 'has select2 data' : 'no select2 data',
      };
    });
    
    try {
      jQuery('select.select2-hidden-accessible').eq(1).val('133900000').trigger('change.select2');
      info.triggeredSelect2 = true;
    } catch(e) {
      info.select2Error = e.message;
    }
  }
  
  return info;
});

console.log('Page info:', JSON.stringify(pageInfo, null, 2));

await page.waitForTimeout(3000);

// Check if cities loaded
const afterTrigger = await page.evaluate(() => {
  const selects = document.querySelectorAll('select.select2-hidden-accessible');
  const citySelect = selects[2];
  return {
    cityOptions: Array.from(citySelect?.options || []).map(o => o.text),
    cityCount: citySelect?.options?.length || 0,
  };
});
console.log('\nAfter select2 trigger:', JSON.stringify(afterTrigger));

// If still no cities, try UI interaction directly
if (afterTrigger.cityCount === 0) {
  console.log('\nTrying UI interaction...');
  
  // Click the select2-selection to open the province dropdown
  const select2Containers = await page.locator('.select2-container').all();
  console.log(`Found ${select2Containers.length} select2 containers`);
  
  if (select2Containers.length >= 2) {
    // The second container (index 1) should be the province one
    // Click it to open
    await select2Containers[1].click();
    await page.waitForTimeout(500);
    
    // Now find the select2-results and click Metro Manila
    const resultsOptions = await page.locator('.select2-results__option').all();
    console.log(`Found ${resultsOptions.length} results options`);
    
    for (const opt of resultsOptions) {
      const text = await opt.textContent();
      console.log(`Option: "${text}"`);
      if (text?.trim() === 'Metro Manila') {
        await opt.click();
        console.log('Clicked Metro Manila');
        break;
      }
    }
    
    await page.waitForTimeout(3000);
    
    const afterCity = await page.evaluate(() => {
      const selects = document.querySelectorAll('select.select2-hidden-accessible');
      return {
        cityOptions: Array.from(selects[2]?.options || []).map(o => o.text),
        cityCount: selects[2]?.options?.length || 0,
      };
    });
    console.log('\nAfter UI selection:', JSON.stringify(afterCity));
  }
}

await page.waitForTimeout(3000);
await browser.close();
