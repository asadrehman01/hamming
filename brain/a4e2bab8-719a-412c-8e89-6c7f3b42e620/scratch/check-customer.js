
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://tauunmprgfnjzwbjulwb.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhdXVubXByZ2Zuanp3Ymp1bHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3MDUzNywiZXhwIjoyMDkwOTQ2NTM3fQ.WEZpoFHRug8hQsYbS0RbhKD5QeD27IdvHvqJHcvQy1A";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkCustomer() {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("email", "asadrehman05@hotmail.com");

  if (error) {
    console.error("Error fetching customer:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No customer found with email asadrehman05@hotmail.com");
  } else {
    console.log("Customer found:", JSON.stringify(data, null, 2));
  }
}

checkCustomer();
