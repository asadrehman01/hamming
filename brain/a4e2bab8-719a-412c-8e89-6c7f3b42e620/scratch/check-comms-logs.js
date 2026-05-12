
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://tauunmprgfnjzwbjulwb.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhdXVubXByZ2Zuanp3Ymp1bHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3MDUzNywiZXhwIjoyMDkwOTQ2NTM3fQ.WEZpoFHRug8hQsYbS0RbhKD5QeD27IdvHvqJHcvQy1A";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkLogs() {
  const { data, error } = await supabase
    .from("communication_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching logs:", error);
    return;
  }

  console.log("Communication logs:", JSON.stringify(data, null, 2));
}

checkLogs();
