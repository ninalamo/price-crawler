import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

// Try to find branch options on the page or via API
const branchInfo = await page.evaluate(async () => {
  const info = {};
  
  // Check if there's a branch dropdown already rendered in the header
  const branchSelect = document.querySelector('select[name="branch"], [class*="branch"] select, #branch, [data-select2-id="1"]');
  info.branchSelectHtml = branchSelect ? branchSelect.outerHTML.substring(0, 1000) : 'not found';
  
  // Check for any hidden branch inputs
  const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
  info.hiddenInputs = Array.from(hiddenInputs).map(i => ({ name: i.name, value: i.value }));
  
  // Try the branch-list API endpoint
  const meta = document.querySelector('meta[name="csrf-token"]');
  const token = meta?.getAttribute('content') || '';
  
  try {
    const resp = await fetch('/branches/branch-list', {
      headers: { 'X-CSRF-TOKEN': token, 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (resp.ok) {
      info.branchList = await resp.json();
    } else {
      info.branchListError = `HTTP ${resp.status}`;
    }
  } catch(e) {
    info.branchListError = e.message;
  }
  
  // Try /api/branches
  try {
    const resp2 = await fetch('/api/branches', {
      headers: { 'X-CSRF-TOKEN': token, 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (resp2.ok) {
      info.apiBranches = await resp2.json();
    } else {
      info.apiBranchesError = `HTTP ${resp2.status}`;
    }
  } catch(e) {
    info.apiBranchesError = e.message;
  }
  
  return info;
});

console.log('Branch discovery:', JSON.stringify(branchInfo, null, 2));

// Also check the initial page HTML for branch data
const branchData = await page.evaluate(() => {
  // Check the branch header dropdown
  const branchEl = document.querySelector('[class*="branch"], [class*="Branch"], .header-branch');
  if (!branchEl) return 'no branch element';
  return branchEl.innerHTML.substring(0, 1000);
});
console.log('\nHeader branch HTML:', branchData);

await browser.close();
