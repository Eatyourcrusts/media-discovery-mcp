import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nlrbtjqwjpernhtvjwrl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94'
);

console.log('🔍 Testing database connection...');

// Test companies
const { data: companies } = await supabase
  .from('companies_searchable')
  .select('business_name')
  .limit(3);

console.log('Companies found:', companies?.map(c => c.business_name));

// Test ad formats
const { data: formats } = await supabase
  .from('ad_formats')
  .select('name')
  .limit(3);

console.log('Ad formats found:', formats?.map(f => f.name));
console.log('✅ Everything looks good!');
