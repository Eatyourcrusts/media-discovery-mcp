import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://nlrbtjqwjpernhtvjwrl.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94");

console.log("=== AD_FORMATS TABLE (direct) ===");
const { data: formatsTable, error: formatsError } = await supabase.from("ad_formats").select("*").limit(1);
console.log("Error:", formatsError);
console.log("Available columns:", Object.keys(formatsTable?.[0] || {}));
console.log("Count:", formatsTable?.length);

console.log("\n=== AD_FORMATS_SEARCHABLE VIEW ===");
const { data: formatsView, error: viewError } = await supabase.from("ad_formats_searchable").select("*").limit(1);
console.log("Error:", viewError);
console.log("Data:", formatsView);
