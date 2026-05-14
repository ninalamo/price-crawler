import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Test: visit SM Supermarket, get token, call API with page.request
console.log('=== Visit SM Supermarket Makati ===');
await page.goto('https://www.metromart.com/shops/sm-supermarket-makati', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(5000);

// Get token
const cookies = await page.context().cookies();
const token = cookies.find(c => c.name === 'token')?.value;
console.log('Token:', token?.substring(0, 60));

// Get departments via page.evaluate
const departments = await page.evaluate(async (tok) => {
  const resp = await fetch(
    'https://api.metromart.com/api/v2/departments?filter[shop-id]=2109&filter[product.status]=available&fields[departments]=name,available-products-count,priority',
    { headers: { 'Authorization': `Token ${tok}`, 'Accept': 'application/json' } }
  );
  return resp.json();
}, token);

console.log(`Departments: ${departments.data?.length || 0}`);
const deptWithProducts = departments.data?.filter(d => d.attributes?.['available-products-count'] > 0) || [];
console.log(`Departments with products: ${deptWithProducts.length}`);
deptWithProducts.slice(0, 5).forEach(d => 
  console.log(`  ID:${d.id} ${d.attributes.name} (${d.attributes['available-products-count']} products)`)
);

// Get products for first department with products
if (deptWithProducts.length > 0) {
  const firstDept = deptWithProducts[0];
  console.log(`\n=== Products for ${firstDept.attributes.name} (ID:${firstDept.id}) ===`);
  
  const products = await page.evaluate(async (args) => {
    const resp = await fetch(
      `https://api.metromart.com/api/v2/products?filter[shop-id]=2109&filter[department-id]=${args.deptId}&page[number]=1&page[size]=5&fields[products]=name,amount-in-cents,base-amount-in-cents,image-url,unit,package-size,promotion-label,promotion-amount-in-cents`,
      { headers: { 'Authorization': `Token ${args.tok}`, 'Accept': 'application/json' } }
    );
    return resp.json();
  }, { tok: token, deptId: firstDept.id });
  
  console.log(`Products returned: ${products.data?.length}`);
  if (products.data?.length > 0) {
    const p = products.data[0].attributes;
    console.log('Sample product:');
    console.log(`  Name: ${p.name}`);
    console.log(`  Price: ₱${(p['amount-in-cents'] / 100).toFixed(2)}`);
    console.log(`  Unit: ${p.unit}`);
    console.log(`  Package size: ${p['package-size']}`);
    console.log(`  Image: ${p['image-url']?.substring(0, 80)}`);
    console.log(`  Full attrs:`, JSON.stringify(p));
  }
  console.log('Meta:', JSON.stringify(products.meta));
  
  // Test: does the SM token work for a different shop (e.g., Robinsons - shop 135)?
  console.log(`\n=== Testing cross-shop token: Robinsons (shop 135) ===`);
  const robinsonsProducts = await page.evaluate(async (tok) => {
    const resp = await fetch(
      'https://api.metromart.com/api/v2/products?filter[shop-id]=135&filter[department-id]=43881&page[number]=1&page[size]=3&fields[products]=name,amount-in-cents,base-amount-in-cents,image-url,unit,package-size',
      { headers: { 'Authorization': `Token ${tok}`, 'Accept': 'application/json' } }
    );
    if (!resp.ok) return { error: `HTTP ${resp.status}`, text: await resp.text().then(t => t.substring(0, 100)) };
    return resp.json();
  }, token);
  
  if (robinsonsProducts.error) {
    console.log('Cross-shop denied:', robinsonsProducts.error, robinsonsProducts.text);
  } else {
    console.log(`Robinsons products: ${robinsonsProducts.data?.length}`);
    if (robinsonsProducts.data?.length > 0) {
      console.log('Sample:', JSON.stringify(robinsonsProducts.data[0].attributes));
    }
  }
}

await browser.close();
