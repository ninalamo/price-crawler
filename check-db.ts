import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: stores } = await supabase.from('stores').select('id, name');
  for (const st of stores || []) {
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', st.id);
    console.log(`${st.name}: ${count}`);
  }

  const { count: total } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true });
  console.log(`Total: ${total}`);
  
  const { count: history } = await supabase
    .from('price_history')
    .select('id', { count: 'exact', head: true });
  console.log(`Price records: ${history}`);
}

main().catch(console.error);
