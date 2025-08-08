import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94'
);

console.log('🔄 Refreshing materialized views...');

try {
  // Try to refresh companies_searchable
  const { error: compError } = await supabase.rpc('refresh_companies_searchable');
  if (compError) {
    console.log('Companies refresh failed:', compError.message);
  } else {
    console.log('✅ Companies materialized view refreshed!');
  }
} catch (e) {
  console.log('RPC call failed, trying manual approach...');
}

// Check if it worked
const { data: companies, error } = await supabase
  .from('companies_searchable')
  .select('business_name, embedding')
  .limit(5);

if (companies && companies.length > 0) {
  console.log(`✅ Found ${companies.length} companies in materialized view`);
  companies.forEach(c => {
    console.log(`- ${c.business_name}: ${c.embedding ? 'HAS EMBEDDING' : 'NULL'}`);
  });
} else {
  console.log('❌ Materialized view still empty');
}
