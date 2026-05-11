/**
 * api/scanner/unmapped-ids.js
 * GET /api/scanner/unmapped-ids
 *
 * Returns all distinct unreviewed device_user_ids from unmatched_scans with:
 *   - scan_count, first_seen, last_seen per UID
 *   - full customer list (id, name, gym_member_id) for the mapping dropdown
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const supabaseUrl     = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey  = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const h = req.headers?.authorization || "";
    const t = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    if (!t) return res.status(401).json({ error: "Missing auth token." });

    const { data: { user }, error: ae } =
      await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(t);
    if (ae || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // All unreviewed scans for this gym (fetch raw rows, aggregate in JS)
    const { data: rawScans, error: se } = await admin
      .from("unmatched_scans")
      .select("device_user_id, scanned_at")
      .eq("user_id", user.id)
      .eq("reviewed", false)
      .order("scanned_at", { ascending: true });

    if (se) throw se;

    // Group by device_user_id
    const grouped = new Map();
    for (const row of rawScans ?? []) {
      const uid = row.device_user_id;
      if (!grouped.has(uid)) {
        grouped.set(uid, { device_user_id: uid, scan_count: 0, first_seen: row.scanned_at, last_seen: row.scanned_at });
      }
      const entry = grouped.get(uid);
      entry.scan_count++;
      if (row.scanned_at < entry.first_seen) entry.first_seen = row.scanned_at;
      if (row.scanned_at > entry.last_seen)  entry.last_seen  = row.scanned_at;
    }

    // Sort by last_seen descending (most recently active first)
    const unmapped = [...grouped.values()].sort(
      (a, b) => new Date(b.last_seen) - new Date(a.last_seen)
    );

    // Full customer list for the mapping dropdown
    const { data: customers, error: ce } = await admin
      .from("customers")
      .select("id, first_name, last_name, gym_member_id, phone")
      .eq("gym_id", user.id)
      .order("first_name", { ascending: true });

    if (ce) throw ce;

    return res.status(200).json({
      success: true,
      unmapped_count: unmapped.length,
      unmapped,
      customers: (customers ?? []).map((c) => ({
        id:             c.id,
        name:           `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        gym_member_id:  c.gym_member_id ?? null,
        phone:          c.phone ?? null,
      })),
    });

  } catch (err) {
    console.error("[scanner/unmapped-ids]", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
