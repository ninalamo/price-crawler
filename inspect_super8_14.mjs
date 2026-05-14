import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);

const result = await page.evaluate(async () => {
  const meta = document.querySelector('meta[name="csrf-token"]');
  const token = meta?.getAttribute('content') || '';
  
  async function fetchCoverage(body) {
    const resp = await fetch('/branches/fetch-branch-coverage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': token,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams(body),
    });
    return resp.json();
  }
  
  // Test 1: Only province
  const r1 = await fetchCoverage({ province_code: '133900000' });
  
  // Test 2: Province + city (Quezon City)
  const r2 = await fetchCoverage({ province_code: '133900000', city_code: '133913000' });
  
  // Test 3: Province + city + brgy
  const r3 = await fetchCoverage({ province_code: '133900000', city_code: '133913000', brgy_code: '133913001' });
  
  return {
    onlyProvince: {
      provinces: r1.provinces?.length || 0,
      cities: r1.cities?.length || 0,
      branches: r1.branches?.length || 0,
      sampleCities: (r1.cities || []).slice(0, 5).map(c => ({ code: c.code, name: c.name })),
    },
    withCity: {
      cities: r2.cities?.length || 0,
      branches: r2.branches?.length || 0,
      barangays: Object.keys(r2).filter(k => k !== 'provinces' && k !== 'cities' && k !== 'branches'),
      sampleBarangays: Array.isArray(r2.barangays || r2.brgys) 
        ? (r2.barangays || r2.brgys).slice(0, 5) 
        : Object.entries(r2).slice(0, 10),
      branches: r2.branches || [],
      raw: JSON.stringify(r2).substring(0, 1000),
    },
    withBrgy: {
      branches: r3.branches || [],
      branchCount: (r3.branches || []).length,
      raw: JSON.stringify(r3).substring(0, 1000),
    },
  };
});

console.log('Results:', JSON.stringify(result, null, 2));

await browser.close();
