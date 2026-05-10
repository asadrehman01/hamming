import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";

const listAllAuthUsers = async (adminClient) => {
  const perPage = 1000;
  const maxPages = 100;
  let page = 1;
  const users = [];

  while (true) {
    if (page > maxPages) {
      throw new Error(`Auth user pagination exceeded ${maxPages} pages.`);
    }

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return res
        .status(500)
        .json({ error: "Missing Supabase server environment variables." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const [{ data: gyms, error: gymError }, authUsers] = await Promise.all([
      admin
        .from("gyms")
        .select("id, name, created_at, billing_settings(gym_display_name)")
        .order("created_at", { ascending: false }),
      listAllAuthUsers(admin),
    ]);

    if (gymError) {
      throw gymError;
    }

    const emailByUserId = new Map(
      authUsers.map((authUser) => [authUser.id, authUser.email || ""]),
    );

    const users = (gyms || []).map((gym) => ({
      id: gym.id,
      loginEmail: emailByUserId.get(gym.id) || "",
      gymName:
        gym.billing_settings?.gym_display_name || gym.name || "MY GYM",
      createdAt: gym.created_at,
    }));

    return res.status(200).json({
      totalUsers: users.length,
      users,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
}
