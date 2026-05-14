import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });  // visible to see what happens
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

console.log('=== Super8 Location Modal ===');

const modalInfo = await page.evaluate(() => {
  const results = {};
  
  // Find the visible modal with location selection
  const modals = document.querySelectorAll('.modal.fade.show, .modal.show');
  results.visibleModals = modals.length;
  results.modalHtml = Array.from(modals).map(m => ({
    classes: m.className,
    html: m.innerHTML.substring(0, 1000),
    text: (m.textContent || '').substring(0, 500),
  }));
  
  // Find all selects and their options in the visible modal
  const selects = document.querySelectorAll('.modal.show select, .modal.fade.show select, select');
  results.selects = Array.from(selects).map(s => ({
    name: s.name,
    id: s.id,
    className: s.className,
    options: Array.from(s.options).map(o => ({ text: o.text, value: o.value })),
  }));
  
  // Find buttons in the visible modal
  const buttons = document.querySelectorAll('.modal.show button, .modal.fade.show button');
  results.buttons = Array.from(buttons).map(b => ({
    text: b.textContent?.trim(),
    className: b.className,
    type: b.type,
  }));
  
  return results;
});

console.log('Visible modals:', modalInfo.visibleModals);
console.log('\nModal text:', modalInfo.modalHtml?.[0]?.text?.substring(0, 500));
console.log('\nSelect dropdowns:', JSON.stringify(modalInfo.selects, null, 2));
console.log('\nButtons:', JSON.stringify(modalInfo.buttons, null, 2));

// Try selecting Metro Manila from the province dropdown
const selects = modalInfo.selects || [];
const provinceSelect = selects.find(s => s.options.some(o => o.text === 'Metro Manila'));
if (provinceSelect) {
  console.log('\n=== Selecting Metro Manila ===');
  await page.selectOption(`select.${provinceSelect.className.split(' ')[0]}`, 'Metro Manila');
  await page.waitForTimeout(2000);
  
  const afterSelect = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    return Array.from(selects).map(s => ({
      name: s.name,
      id: s.id,
      options: Array.from(s.options).map(o => ({ text: o.text.substring(0, 50), value: o.value })),
    }));
  });
  
  console.log('Selects after province selection:', JSON.stringify(afterSelect, null, 2));
  
  // Find the city select (should now have options)
  const citySelect = afterSelect.find(s => s.options.length > (s.options[0]?.text === 'Select Branch' ? 2 : 1) && s !== provinceSelect);
  if (citySelect) {
    // Select the first actual city
    const firstCity = citySelect.options.find(o => o.text !== 'Select Branch');
    if (firstCity) {
      console.log(`\n=== Selecting city: ${firstCity.text} ===`);
      await page.selectOption(`select:nth-of-type(2)`, firstCity.value);
      await page.waitForTimeout(1000);
    }
  }
  
  // Click Go button
  console.log('\n=== Clicking Go ===');
  const goBtn = modalInfo.buttons.find(b => b.text?.toLowerCase().includes('go'));
  if (goBtn) {
    await page.click(`button:has-text("Go")`);
    console.log('Clicked Go');
  }
  
  await page.waitForTimeout(5000);
  
  const afterSubmit = await page.evaluate(() => {
    // Check for products
    const products = document.querySelectorAll('[class*="product"], [class*="Product"], .item, [class*="card"]');
    const visibleModals = document.querySelectorAll('.modal.show');
    const bodyPreview = document.body.innerText.substring(0, 500);
    return {
      productCount: products.length,
      visibleModals: visibleModals.length,
      bodyPreview,
      url: window.location.href,
    };
  });
  
  console.log('After Go:', JSON.stringify(afterSubmit, null, 2));
}

await page.waitForTimeout(5000);
await browser.close();
