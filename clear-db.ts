import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function clear() {
  console.log('Clearing price_history...');
  const { error: e1 } = await supabase.from('price_history').delete().neq('id', 0);
  if (e1) { console.log('FAILED:', e1.message); } else { console.log('OK'); }

  console.log('Clearing products...');
  const { error: e2 } = await supabase.from('products').delete().neq('id', 0);
  if (e2) { console.log('FAILED:', e2.message); } else { console.log('OK'); }

  console.log('Clearing crawl_sessions...');
  const { error: e3 } = await supabase.from('crawl_sessions').delete().neq('id', '');
  if (e3) { console.log('FAILED:', e3.message); } else { console.log('OK'); }

  console.log('Clearing categories...');
  const { error: e4 } = await supabase.from('categories').delete().neq('id', 0);
  if (e4) { console.log('FAILED:', e4.message); } else { console.log('OK'); }

  // Verify
  const { count: total } = await supabase.from('products').select('id', { count: 'exact', head: true });
  console.log('Products remaining:', total);
}

clear().catch(e => console.log('CRASHED:', e.message));
