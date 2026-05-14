import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

// Use evaluate to set select values and trigger change events
const result = await page.evaluate(() => {
  const selects = document.querySelectorAll('select.select2-hidden-accessible');
  console.log('Found selects:', selects.length);
  
  // Selects: [0]=sort, [1]=province, [2]=city, [3]=? (maybe district)
  const provinceSelect = selects[1];
  const citySelect = selects[2];
  
  if (!provinceSelect) return { error: 'No province select found' };
  
  // Set province to Metro Manila (value=133900000)
  provinceSelect.value = '133900000';
  
  // Trigger change event for Select2
  const event = new Event('change', { bubbles: true });
  provinceSelect.dispatchEvent(event);
  
  return {
    provinceValue: provinceSelect.value,
    cityOptionsBefore: Array.from(citySelect?.options || []).map(o => o.text),
    cityOptionsCount: citySelect?.options?.length || 0,
  };
});

console.log('After province selection:', JSON.stringify(result));

// Wait for city options to load
await page.waitForTimeout(3000);

const afterWait = await page.evaluate(() => {
  const selects = document.querySelectorAll('select.select2-hidden-accessible');
  const citySelect = selects[2];
  const districtSelect = selects[3];
  
  return {
    cityOptions: Array.from(citySelect?.options || []).map(o => ({ text: o.text, value: o.value })),
    districtOptions: Array.from(districtSelect?.options || []).map(o => ({ text: o.text, value: o.value })),
  };
});

console.log('\nAfter wait:', JSON.stringify(afterWait, null, 2));

// Select first city
const cityOptions = afterWait.cityOptions || [];
const firstCity = cityOptions.find(o => o.text !== 'Select Branch');
if (firstCity) {
  console.log(`\nSelecting city: ${firstCity.text} (${firstCity.value})`);
  
  await page.evaluate((cityValue) => {
    const selects = document.querySelectorAll('select.select2-hidden-accessible');
    const citySelect = selects[2];
    citySelect.value = cityValue;
    const event = new Event('change', { bubbles: true });
    citySelect.dispatchEvent(event);
  }, firstCity.value);
  
  await page.waitForTimeout(2000);
  
  // Check for district options
  const districtInfo = await page.evaluate(() => {
    const selects = document.querySelectorAll('select.select2-hidden-accessible');
    const districtSelect = selects[3];
    return {
      districtOptions: Array.from(districtSelect?.options || []).map(o => ({ text: o.text, value: o.value })),
    };
  });
  console.log('District options:', JSON.stringify(districtInfo));
  
  // If there's a district, select the first one
  if (districtInfo.districtOptions?.length > 0) {
    const firstDistrict = districtInfo.districtOptions.find(o => o.text !== 'Select Branch');
    if (firstDistrict) {
      await page.evaluate((dv) => {
        const selects = document.querySelectorAll('select.select2-hidden-accessible');
        const districtSelect = selects[3];
        districtSelect.value = dv;
        const event = new Event('change', { bubbles: true });
        districtSelect.dispatchEvent(event);
      }, firstDistrict.value);
      await page.waitForTimeout(1000);
    }
  }
  
  // Click Go button
  await page.click('button:has-text("Go")');
  console.log('Clicked Go');
  
  await page.waitForTimeout(5000);
  
  const afterSubmit = await page.evaluate(() => {
    const products = document.querySelectorAll('[class*="product"], [class*="Product"], .item, [class*="card"]');
    const visibleModals = document.querySelectorAll('.modal.show');
    const bodyPreview = document.body.innerText.substring(0, 800);
    return {
      productCount: products.length,
      visibleModals: visibleModals.length,
      url: window.location.href,
      bodyPreview,
    };
  });
  
  console.log('\nAfter Go:', JSON.stringify(afterSubmit, null, 2));
}

await page.waitForTimeout(3000);
await browser.close();
