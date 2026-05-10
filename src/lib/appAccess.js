import { supabase } from "./supabaseClient";

export const isCurrentUserAccessAllowed = async () => {
  if (!supabase) {
    return false;
  }

  try {
    const { data, error } = await supabase.rpc("is_current_user_access_allowed");

    if (error) {
      console.error("RPC error:", error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error("Failed to check user access:", err);
    return false;
  }
};
