import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);

async function selectSelect2Option(containerIndex, optionText) {
  const containers = await page.locator('.select2-container').all();
  if (containerIndex >= containers.length) return false;
  
  // Click to open the dropdown
  await containers[containerIndex].click();
  await page.waitForTimeout(500);
  
  // Wait for results to appear
  await page.waitForSelector('.select2-results__option', { timeout: 5000 }).catch(() => {});
  
  // Find and click the matching option
  const options = await page.locator('.select2-results__option').all();
  for (const opt of options) {
    const text = await opt.textContent();
    if (text?.trim() === optionText) {
      await opt.click();
      return true;
    }
  }
  return false;
}

// Step 1: Select province
console.log('Selecting province: Metro Manila');
await selectSelect2Option(1, 'Metro Manila');
await page.waitForTimeout(3000);

// Step 2: Select city
console.log('Selecting city: Makati City');
await selectSelect2Option(2, 'Makati City');
await page.waitForTimeout(3000);

// Step 3: Select barangay (first available)
console.log('Selecting barangay...');
// Open barangay dropdown
const containers = await page.locator('.select2-container').all();
await containers[3].click();
await page.waitForTimeout(500);
await page.waitForSelector('.select2-results__option', { timeout: 5000 }).catch(() => {});
const brgyOptions = await page.locator('.select2-results__option').all();
let brgySelected = false;
for (const opt of brgyOptions) {
  const text = await opt.textContent();
  if (text?.trim() && text.trim() !== 'Select Branch') {
    console.log(`Selecting barangay: ${text.trim()}`);
    await opt.click();
    brgySelected = true;
    break;
  }
}
await page.waitForTimeout(1000);

// Check if Go is now enabled
let goEnabled = await page.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  for (const b of buttons) {
    if (b.textContent.trim() === 'Go') return !b.disabled;
  }
  return false;
});
console.log('Go button enabled:', goEnabled);

// If still disabled, check state
if (!goEnabled) {
  const state = await page.evaluate(() => {
    const $ = jQuery;
    return {
      province: $('select.select2-hidden-accessible').eq(1).val(),
      city: $('select.select2-hidden-accessible').eq(2).val(),
      brgy: $('select.select2-hidden-accessible').eq(3).val(),
      goDisabled: document.querySelector('button.cstm-btn.btn-primary')?.disabled,
    };
  });
  console.log('Form state:', JSON.stringify(state));
}

// Click Go - use the button class directly since text matching is unreliable
console.log('Clicking Go button via JS...');
await page.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  for (const b of buttons) {
    if (b.textContent.trim() === 'Go') {
      b.click();
      return;
    }
  }
});
console.log('Clicked Go!');
await page.waitForTimeout(5000);

const result = await page.evaluate(() => {
  const products = document.querySelectorAll('[class*="product"], .item, [class*="card"]');
  const productImgs = document.querySelectorAll('img[src*="product"], img.product-image');
  const pageText = document.body.innerText;
  return {
    url: window.location.href,
    productElements: products.length,
    productImages: productImgs.length,
    hasProducts: pageText.includes('Add') || pageText.includes('₱'),
    bodyPreview: pageText.substring(0, 500),
  };
});
console.log('Result:', JSON.stringify(result, null, 2));

await page.waitForTimeout(3000);
await browser.close();
