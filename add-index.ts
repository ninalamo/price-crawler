import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const sql = `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_store_name_sku 
    ON products(store_id, name, COALESCE(sku, ''));
  `;
  
  // Try using the query method directly
  const { error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.log('rpc failed:', error.message);
    // Try direct postgres query via raw SQL endpoint
    console.log('Trying alternative...');
  } else {
    console.log('Index created via RPC');
  }
  
  // Check existing indexes
  const { data: indexes } = await supabase.rpc('exec_sql', { 
    query: "SELECT indexname FROM pg_indexes WHERE tablename='products';" 
  });
  console.log('Indexes:', indexes);
}
run().catch(e => console.log('Error:', e.message));
