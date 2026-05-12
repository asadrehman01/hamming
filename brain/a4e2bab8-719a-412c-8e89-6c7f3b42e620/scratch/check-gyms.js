
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://tauunmprgfnjzwbjulwb.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhdXVubXByZ2Zuanp3Ymp1bHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3MDUzNywiZXhwIjoyMDkwOTQ2NTM3fQ.WEZpoFHRug8hQsYbS0RbhKD5QeD27IdvHvqJHcvQy1A";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkGyms() {
  const { data, error } = await supabase
    .from("gyms")
    .select("id, name")
    .in("id", ["e6142a16-7698-48e3-a319-5b467258417c", "cce3fbc7-dd9e-4a90-b4da-041a0f3d5cca"]);

  if (error) {
    console.error("Error fetching gyms:", error);
    return;
  }

  console.log("Gyms found:", JSON.stringify(data, null, 2));
}

checkGyms();
