async function test() {
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const resp = await fetch('https://pickaroo.com/sm-markets/products/sm-savemore-shoe-ave/search-inventories?group=587-best-sellers&page=1', {
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
    });
    const data = await resp.json();
    const t1 = Date.now();
    console.log(`Call ${i+1}: ${t1-t0}ms, html length: ${data.html.length}`);
  }
}
test().catch(console.error);
