import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94'
);

console.log('🔍 Checking TikTok Ads vectors...');

// Check if TikTok Ads exists and has embeddings
const { data: tiktok, error } = await supabase
  .from('companies_searchable')
  .select('business_name, embedding')
  .ilike('business_name', '%tiktok%');

if (error) {
  console.log('❌ Error:', error);
} else if (tiktok.length === 0) {
  console.log('❌ TikTok Ads not found in database');
} else {
  console.log('\n=== TIKTOK ADS RESULTS ===');
  tiktok.forEach(company => {
    console.log(`${company.business_name}: embedding = ${company.embedding ? 'EXISTS (' + company.embedding.length + ' dims)' : 'NULL'}`);
  });
}

// Also check all companies with embeddings status
console.log('\n=== ALL COMPANIES EMBEDDING STATUS ===');
const { data: allCompanies } = await supabase
  .from('companies_searchable')  
  .select('business_name, embedding')
  .order('business_name');

allCompanies.forEach(c => {
  const status = c.embedding ? `✅ EXISTS (${c.embedding.length} dims)` : '❌ NULL';
  console.log(`${c.business_name}: ${status}`);
});
