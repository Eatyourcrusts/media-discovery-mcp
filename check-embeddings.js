import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94'
);

console.log('🔍 Checking database embeddings...');

// Check companies embeddings
const { data: companies } = await supabase
  .from('companies_searchable')
  .select('business_name, embedding')
  .limit(2);

console.log('\n=== COMPANIES ===');
companies.forEach(c => {
  console.log(`${c.business_name}: embedding = ${c.embedding ? 'EXISTS (' + c.embedding.length + ' dims)' : 'NULL'}`);
});

// Check ad formats embeddings
const { data: formats } = await supabase
  .from('ad_formats')
  .select('name, embedding')
  .limit(2);

console.log('\n=== AD FORMATS ===');
formats.forEach(f => {
  console.log(`${f.name}: embedding = ${f.embedding ? 'EXISTS (' + f.embedding.length + ' dims)' : 'NULL'}`);
});
