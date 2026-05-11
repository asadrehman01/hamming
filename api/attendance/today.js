/**
 * api/attendance/today.js
 * GET /api/attendance/today
 * Returns all check-ins from midnight (local gym date) to now, with member info.
 * Optional: ?tz=Asia/Kolkata  (IANA timezone, defaults to UTC)
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";

export default async function handler(req, res) {
  // Restrict CORS origins via allowlist
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
  const requestOrigin = req.headers?.origin || "";

  if (requestOrigin) {
    if (allowedOrigins.length === 0 || !allowedOrigins.includes(requestOrigin)) {
      return res.status(403).json({ error: "Forbidden: origin not allowed" });
    }
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  }
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

    // Validate timezone identifier
    const tz = String(req.query?.tz ?? "UTC");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch (_) {
      return res.status(400).json({ error: "Invalid timezone identifier" });
    }

    // Compute midnight in the requested timezone
    let todayMidnight;
    try {
      const now = new Date();
      // Use Intl.DateTimeFormat to reliably extract local date parts in target timezone
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).formatToParts(now);
      
      const d = {};
      parts.forEach(p => { d[p.type] = p.value; });
      
      const year = parseInt(d.year, 10);
      const month = parseInt(d.month, 10) - 1; // 0-indexed
      const day = parseInt(d.day, 10);
      
      // Compute the UTC offset at 'now' in target timezone
      const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
      const tzOffset = now.getTime() - localNow.getTime();
      
      // Calculate UTC timestamp of local midnight: Date.UTC(y, m, d) + offset
      todayMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0) + tzOffset);
    } catch (_) {
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
      .order("scanned_at", { ascending: false })
      .limit(10000);

    if (error) throw error;

    // Separate unique visitors from repeat check-ins
    // Use the nested customers relation (r.customers?.id) instead of non-existent r.customer_id
    const uniqueCustomerIds = new Set(
      (data ?? []).filter((r) => r.customers?.id).map((r) => r.customers.id)
    );

    return res.status(200).json({
      success: true,
      date: todayMidnight.toISOString().slice(0, 10),
      total_scans:    count ?? 0,
      unique_visitors: uniqueCustomerIds.size,
      logs: data ?? [],
    });
  } catch (err) {
    console.error("[today] Internal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
