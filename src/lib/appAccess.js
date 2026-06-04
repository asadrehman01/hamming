import { supabase } from "./supabaseClient";
import { getUserWithRetry } from "./authUser";

export const isCurrentUserAccessAllowed = async () => {
  if (!supabase) {
    return false;
  }

  try {
    const { data: { user } } = await getUserWithRetry(supabase);
    if (!user) return false;

    const { data, error } = await supabase
      .from("user_access")
      .select("access_granted")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to check user access status:", error);
      // Return true (allowed by default) if the table does not exist or has errors
      return true;
    }

    if (data && data.access_granted === false) {
      return false;
    }

    return true;
  } catch (err) {
    console.error("Failed to check user access:", err);
    return true;
  }
};
