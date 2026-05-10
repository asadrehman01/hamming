import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const listAllAuthUsers = async (
  adminClient: ReturnType<typeof createClient>,
) => {
  const perPage = 1000;
  let page = 1;
  const users: Array<{ id: string; email?: string | null }> = [];

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const pageUsers = Array.isArray(data?.users) ? data.users : [];
    users.push(...pageUsers);

    if (pageUsers.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables for admin-users.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const [{ data: gyms, error: gymError }, { data: billingSettings, error: billingError }, authUsers] = await Promise.all([
      admin
        .from("gyms")
        .select("id, name, created_at")
        .order("created_at", { ascending: false }),
      admin
        .from("billing_settings")
        .select("gym_id, gym_display_name"),
      listAllAuthUsers(admin),
    ]);

    if (gymError) {
      throw gymError;
    }

    if (billingError) {
      throw billingError;
    }

    const emailByUserId = new Map(
      authUsers.map((authUser) => [authUser.id, authUser.email || ""]),
    );

    const billingByGymId = new Map(
      (billingSettings || []).map((billing) => [
        billing.gym_id,
        billing.gym_display_name,
      ]),
    );

    const users = (gyms || []).map((gym) => ({
      id: gym.id,
      loginEmail: emailByUserId.get(gym.id) || "",
      gymName:
        billingByGymId.get(gym.id) || gym.name || "MY GYM",
      createdAt: gym.created_at,
    }));

    return new Response(
      JSON.stringify({
        totalUsers: users.length,
        users,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
