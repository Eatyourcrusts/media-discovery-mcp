import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94'
);

console.log('🔍 Checking MATERIALIZED VIEWS for embeddings...');

// Check companies_searchable materialized view
console.log('\n=== COMPANIES_SEARCHABLE (materialized view) ===');
const { data: companiesView } = await supabase
  .from('companies_searchable')
  .select('business_name, embedding, searchable_text, total_relationships, media_categories')
  .order('business_name');

if (companiesView) {
  console.log(`Found ${companiesView.length} companies in materialized view`);
  
  companiesView.forEach(c => {
    const embeddingStatus = c.embedding ? `✅ EXISTS (${c.embedding.length} dims)` : '❌ NULL';
    const textStatus = c.searchable_text ? `✅ HAS TEXT (${c.searchable_text.length} chars)` : '❌ NO TEXT';
    const relationshipStatus = c.total_relationships ? `📊 ${c.total_relationships} relationships` : '❌ No relationships';
    const categoriesStatus = c.media_categories && c.media_categories.length > 0 ? `📋 ${c.media_categories.length} categories` : '❌ No categories';
    
    console.log(`${c.business_name}:`);
    console.log(`  Embedding: ${embeddingStatus}`);
    console.log(`  Text: ${textStatus}`);
    console.log(`  Relationships: ${relationshipStatus}`);
    console.log(`  Categories: ${categoriesStatus}`);
    if (c.media_categories && c.media_categories.length > 0) {
      console.log(`  Sample categories: ${c.media_categories.slice(0, 3).join(', ')}`);
    }
    console.log('');
  });
} else {
  console.log('❌ No data found in companies_searchable - view may not exist');
}

// Check ad_formats_searchable materialized view if it exists
console.log('\n=== AD_FORMATS_SEARCHABLE (materialized view) ===');
const { data: formatsView } = await supabase
  .from('ad_formats_searchable')
  .select('format_name, company_name, embedding, searchable_text, total_relationships, media_categories')
  .limit(5);

if (formatsView) {
  console.log(`Found ${formatsView.length} ad formats in materialized view`);
  
  formatsView.forEach(f => {
    const embeddingStatus = f.embedding ? `✅ EXISTS (${f.embedding.length} dims)` : '❌ NULL';
    const textStatus = f.searchable_text ? `✅ HAS TEXT (${f.searchable_text.length} chars)` : '❌ NO TEXT';
    const relationshipStatus = f.total_relationships ? `📊 ${f.total_relationships} relationships` : '❌ No relationships';
    
    console.log(`${f.format_name} (${f.company_name}):`);
    console.log(`  Embedding: ${embeddingStatus}`);
    console.log(`  Text: ${textStatus}`);
    console.log(`  Relationships: ${relationshipStatus}`);
    console.log('');
  });
} else {
  console.log('❌ No ad_formats_searchable view found or no data');
}

// Summary comparison
console.log('\n=== SUMMARY COMPARISON ===');

// Get counts from direct tables
const { data: directCompanies } = await supabase
  .from('companies')
  .select('business_name, embedding')
  .not('embedding', 'is', null);

const { data: viewCompanies } = await supabase
  .from('companies_searchable')
  .select('business_name, embedding')
  .not('embedding', 'is', null);

console.log(`Direct companies table: ${directCompanies?.length || 0} companies with embeddings`);
console.log(`Materialized view: ${viewCompanies?.length || 0} companies with embeddings`);

if (directCompanies && viewCompanies) {
  const directDims = directCompanies[0]?.embedding?.length || 0;
  const viewDims = viewCompanies[0]?.embedding?.length || 0;
  
  console.log(`Direct table embedding dimensions: ${directDims}`);
  console.log(`Materialized view embedding dimensions: ${viewDims}`);
  
  if (viewDims === 1536) {
    console.log('✅ Materialized view has correct 1536-dimension embeddings!');
  } else if (directDims > 19000) {
    console.log('⚠️ Direct table has large embeddings, materialized view is better choice');
  }
}

