
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://tauunmprgfnjzwbjulwb.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhdXVubXByZ2Zuanp3Ymp1bHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3MDUzNywiZXhwIjoyMDkwOTQ2NTM3fQ.WEZpoFHRug8hQsYbS0RbhKD5QeD27IdvHvqJHcvQy1A";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function revertExpiry() {
  const { data, error } = await supabase
    .from("customers")
    .update({ membership_end_date: "2026-05-14" })
    .eq("email", "asadrehman05@hotmail.com")
    .eq("gym_id", "e6142a16-7698-48e3-a319-5b467258417c");

  if (error) {
    console.error("Error reverting customer:", error);
    return;
  }

  console.log("Customer expiry reverted to 2026-05-14.");
}

revertExpiry();
