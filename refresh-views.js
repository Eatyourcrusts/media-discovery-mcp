import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://nlrbtjqwjpernhtvjwrl.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94");

console.log("Refreshing materialized view...");
const { error } = await supabase.rpc('refresh_materialized_view', { view_name: 'ad_formats_searchable' });

if (error) {
  console.log("RPC failed, trying direct SQL...");
  // Try direct SQL refresh
  const { error: sqlError } = await supabase.from('').select('refresh materialized view ad_formats_searchable');
  console.log("SQL Error:", sqlError);
} else {
  console.log("✅ Successfully refreshed view!");
}

// Check if it worked
console.log("\n=== CHECKING REFRESHED VIEW ===");
const { data: refreshedData } = await supabase.from("ad_formats_searchable").select("*").limit(2);
console.log("Records found:", refreshedData?.length || 0);
console.log("Sample format:", refreshedData?.[0]?.name || "No data");
