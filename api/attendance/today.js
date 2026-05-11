/**
 * api/attendance/today.js
 * GET /api/attendance/today
 * Returns all check-ins from midnight (local gym date) to now, with member info.
 * Optional: ?tz=Asia/Kolkata  (IANA timezone, defaults to UTC)
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

    const { data: { user }, error: ae } = await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(t);
    if (ae || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    // Compute midnight in the requested timezone
    const tz = String(req.query?.tz ?? "UTC");
    let todayMidnight;
    try {
      const now = new Date();
      const localDateStr = now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
      todayMidnight = new Date(`${localDateStr}T00:00:00`);
      // Adjust to UTC
      const tzOffset = now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime();
      todayMidnight = new Date(todayMidnight.getTime() + tzOffset);
    } catch {
      todayMidnight = new Date();
      todayMidnight.setUTCHours(0, 0, 0, 0);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data, error, count } = await admin
      .from("attendance_logs")
      .select(
        "id, device_user_id, scanned_at, punch_type, status, customers(id, first_name, last_name, phone)",
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .gte("scanned_at", todayMidnight.toISOString())
      .order("scanned_at", { ascending: false });

    if (error) throw error;

    // Separate unique visitors from repeat check-ins
    const uniqueCustomerIds = new Set(
      (data ?? []).filter((r) => r.customer_id).map((r) => r.customer_id)
    );

    return res.status(200).json({
      success: true,
      date: todayMidnight.toISOString().slice(0, 10),
      total_scans:    count ?? 0,
      unique_visitors: uniqueCustomerIds.size,
      logs: data ?? [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
