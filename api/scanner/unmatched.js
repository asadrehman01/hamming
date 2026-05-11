/**
 * api/scanner/unmatched.js
 * GET /api/scanner/unmatched — list unmatched device IDs with scan counts
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";

export default async function handler(req, res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
  const requestOrigin = req.headers?.origin || "";
  if (allowedOrigins.length && !allowedOrigins.includes(requestOrigin)) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", requestOrigin);
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

    const { data: { user }, error: ae } = await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(t);
    if (ae || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data, error } = await admin
      .from("unmatched_scans")
      .select("device_user_id, scanned_at")
      .eq("user_id", user.id)
      .eq("reviewed", false)
      .order("scanned_at", { ascending: false });

    if (error) throw error;

    // Group by device_user_id
    const grouped = {};
    for (const row of data ?? []) {
      if (!grouped[row.device_user_id]) {
        grouped[row.device_user_id] = { device_user_id: row.device_user_id, scan_count: 0, last_seen: row.scanned_at };
      }
      grouped[row.device_user_id].scan_count++;
    }

    const items = Object.values(grouped).sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));

    return res.status(200).json({ success: true, count: items.length, items });
  } catch (err) {
    console.error("[api/scanner/unmatched] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
