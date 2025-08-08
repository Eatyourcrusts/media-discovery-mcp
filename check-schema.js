import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://nlrbtjqwjpernhtvjwrl.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94");

console.log("=== COMPANIES_SEARCHABLE COLUMNS ===");
const { data: companies } = await supabase.from("companies_searchable").select("*").limit(1);
console.log("Available columns:", Object.keys(companies[0] || {}));

console.log("\n=== AD_FORMATS_SEARCHABLE COLUMNS ===");
const { data: formats } = await supabase.from("ad_formats_searchable").select("*").limit(1);
console.log("Available columns:", Object.keys(formats[0] || {}));
