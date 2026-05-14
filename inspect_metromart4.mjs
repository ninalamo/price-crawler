import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let itemsData = null;
let departmentsData = null;

page.on('response', async resp => {
  const url = resp.url();
  try {
    if (url.includes('/api/v1/items') && resp.status() === 200) {
      itemsData = await resp.json();
      console.log('=== ITEMS API CAPTURED ===');
      console.log('URL:', url.substring(0, 300));
    }
    if (url.includes('/api/v2/departments') && resp.status() === 200) {
      departmentsData = await resp.json();
      console.log('=== DEPARTMENTS API CAPTURED ===');
    }
  } catch {}
});

await page.goto('https://www.metromart.com/shops/sm-supermarket-makati', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(5000);

if (departmentsData) {
  const dept = departmentsData.data.find(d => d.attributes?.name === 'Fresh Vegetables');
  const deptId = dept?.id;
  const deptSlug = dept?.attributes?.slug;
  console.log(`\nFresh Vegetables: ID=${deptId}, slug=${deptSlug}`);
  console.log('Full dept attrs:', JSON.stringify(dept?.attributes).substring(0, 500));

  console.log('\nSample department attributes:');
  const sample = departmentsData.data[2];
  console.log('  ID:', sample.id);
  console.log('  Attributes keys:', Object.keys(sample.attributes || {}));
  console.log('  Full:', JSON.stringify(sample.attributes).substring(0, 500));

  // Now visit the department page to trigger items API
  console.log(`\n=== Visiting department page for ${deptSlug} ===`);
  itemsData = null;
  await page.goto(`https://www.metromart.com/shops/sm-supermarket-makati/departments/${deptSlug}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(5000);

  if (itemsData) {
    console.log('\nItems response structure:');
    console.log('Top-level keys:', Object.keys(itemsData));
    console.log('Meta:', JSON.stringify(itemsData.meta));
    
    const items = itemsData.data || [];
    console.log(`Items count: ${items.length}`);
    
    if (items.length > 0) {
      const first = items[0];
      console.log('\nFirst item keys:', Object.keys(first));
      console.log('First item attributes:', JSON.stringify(first.attributes).substring(0, 800));
      console.log('First item relationships:', JSON.stringify(first.relationships).substring(0, 500));
      
      // Check included for product data
      if (itemsData.included) {
        console.log(`\nIncluded items: ${itemsData.included.length}`);
        const types = {};
        itemsData.included.forEach(inc => {
          types[inc.type] = (types[inc.type] || 0) + 1;
        });
        console.log('Included types:', JSON.stringify(types));
        
        const productSample = itemsData.included.find(i => i.type === 'products');
        if (productSample) {
          console.log('\nProduct attributes:', JSON.stringify(productSample.attributes).substring(0, 500));
        }
      }
    }
  }
}

await browser.close();
