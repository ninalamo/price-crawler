import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://www.super8.ph/products', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

// Use JavaScript to programmatically set all Select2 values
const success = await page.evaluate(async () => {
  // Get the 4 selects: [0]=sort, [1]=province, [2]=city, [3]=barangay
  var $province = jQuery('select.select2-hidden-accessible').eq(1);
  var $city = jQuery('select.select2-hidden-accessible').eq(2);
  var $barangay = jQuery('select.select2-hidden-accessible').eq(3);
  
  // Step 1: Set province to Metro Manila (133900000)
  $province.val('133900000').trigger('change');
  
  // Wait for city options to load
  await new Promise(function(resolve) { setTimeout(resolve, 2000); });
  
  // Step 2: Set city to Makati City
  // Find the value for Makati City
  var cityValue = null;
  Array.from($city[0].options).forEach(function(opt) {
    if (opt.text.trim() === 'Makati City') {
      cityValue = opt.value;
    }
  });
  
  if (!cityValue) return { error: 'Makati City not found in options' };
  $city.val(cityValue).trigger('change');
  
  // Wait for barangay options to load
  await new Promise(function(resolve) { setTimeout(resolve, 2000); });
  
  // Step 3: Set barangay to the first available one
  var brgyValue = null;
  Array.from($barangay[0].options).forEach(function(opt) {
    if (!brgyValue && opt.text.trim() !== 'Select Branch') {
      brgyValue = opt.value;
    }
  });
  
  if (!brgyValue) return { error: 'No barangay found' };
  $barangay.val(brgyValue).trigger('change');
  
  await new Promise(function(resolve) { setTimeout(resolve, 500); });
  
  // Check if Go button is now enabled
  var goBtn = document.querySelector('button:has-text("Go")');
  // Actually check all buttons
  var buttons = document.querySelectorAll('button');
  var goBtnInfo = null;
  buttons.forEach(function(b) {
    if (b.textContent.trim() === 'Go') {
      goBtnInfo = { disabled: b.disabled, html: b.outerHTML.substring(0, 200) };
    }
  });
  
  return {
    provinceVal: $province.val(),
    provinceText: $province.find('option:selected').text().trim(),
    cityVal: $city.val(),
    cityText: $city.find('option:selected').text().trim(),
    brgyVal: $barangay.val(),
    brgyText: $barangay.find('option:selected').text().trim(),
    goButton: goBtnInfo,
  };
});

console.log('State after programmatic selection:', JSON.stringify(success, null, 2));

if (success && !success.error) {
  // Try clicking the Go button
  const isEnabled = await page.evaluate(() => {
    var buttons = document.querySelectorAll('button');
    var goBtn = null;
    buttons.forEach(function(b) {
      if (b.textContent.trim() === 'Go') goBtn = b;
    });
    return goBtn ? !goBtn.disabled : false;
  });
  
  console.log('Go button enabled:', isEnabled);
  
  if (isEnabled) {
    await page.click('button:has-text("Go")');
    console.log('Clicked Go!');
    await page.waitForTimeout(5000);
    
    const result = await page.evaluate(() => {
      var products = document.querySelectorAll('[class*="product"], .item, [class*="card"]');
      return {
        productCount: products.length,
        url: window.location.href,
        bodyPreview: document.body.innerText.substring(0, 500),
      };
    });
    console.log('Result:', JSON.stringify(result, null, 2));
  }
}

await page.waitForTimeout(5000);
await browser.close();
