import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94'
);

console.log('🔍 Checking DIRECT tables for embeddings...');

// Check companies direct table
console.log('\n=== COMPANIES (direct table) ===');
const { data: companies } = await supabase
  .from('companies')
  .select('business_name, embedding, searchable_text')
  .order('business_name');

companies.forEach(c => {
  const embeddingStatus = c.embedding ? `✅ EXISTS (${c.embedding.length} dims)` : '❌ NULL';
  const textStatus = c.searchable_text ? `✅ HAS TEXT (${c.searchable_text.length} chars)` : '❌ NO TEXT';
  console.log(`${c.business_name}:`);
  console.log(`  Embedding: ${embeddingStatus}`);
  console.log(`  Text: ${textStatus}`);
});

// Check ad formats direct table
console.log('\n=== AD FORMATS (direct table) ===');
const { data: formats } = await supabase
  .from('ad_formats')
  .select('name, embedding, searchable_text')
  .limit(3);

formats.forEach(f => {
  const embeddingStatus = f.embedding ? `✅ EXISTS (${f.embedding.length} dims)` : '❌ NULL';
  const textStatus = f.searchable_text ? `✅ HAS TEXT (${f.searchable_text.length} chars)` : '❌ NO TEXT';
  console.log(`${f.name}:`);
  console.log(`  Embedding: ${embeddingStatus}`);
  console.log(`  Text: ${textStatus}`);
});
