import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://nlrbtjqwjpernhtvjwrl.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmJ0anF3anBlcm5odHZqd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzgyMzMsImV4cCI6MjA2OTk1NDIzM30.eNuvT_gH9CrV2kYh50E3GD2hHG2P_DY8r-KgshJwK94");
const { data, error } = await supabase.from("companies").select("business_name").limit(3);
console.log("✅ Database connection test:");
console.log("Companies found:", data?.length || 0);
console.log("Sample:", data?.map(c => c.business_name) || []);
