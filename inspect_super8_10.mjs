import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);

// Check form structure
const formInfo = await page.evaluate(() => {
  const forms = document.querySelectorAll('form');
  return Array.from(forms).map(f => ({
    id: f.id,
    action: f.action,
    method: f.method,
    html: f.innerHTML.substring(0, 500),
    inputs: Array.from(f.querySelectorAll('input, select, button')).length,
  }));
});
console.log('Forms:', JSON.stringify(formInfo, null, 2));

// Check the location modal structure more carefully
const modalHtml = await page.evaluate(() => {
  const modal = document.querySelector('.modal.show, .modal.fade.show');
  if (!modal) return 'no visible modal';
  return modal.innerHTML.substring(0, 2000);
});
console.log('\nLocation modal HTML:', modalHtml);

await browser.close();
