/**
 * api/attendance/heatmap.js
 * GET /api/attendance/heatmap
 * Returns punch counts aggregated by day-of-week (0=Sun…6=Sat) and hour (0–23).
 * Optional: ?days=90  (look-back window, default 90)
 *
 * Response shape:
 * {
 *   cells: [{ day: 0, hour: 9, count: 42 }, …],  // 7×24 = 168 cells max
 *   peak: { day: 1, hour: 9, count: 42 },
 *   total: 1234,
 *   malformed: 0,
 * }
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

    const lookbackDays = Math.min(Math.max(1, Number(req.query?.days ?? 90)), 365);
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const tz = String(req.query?.tz ?? "UTC");

    // Validate timezone identifier
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch (_) {
      return res.status(400).json({ error: "Invalid timezone identifier" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Fetch timestamps only — limit to avoid default row cap
    const { data, error } = await admin
      .from("attendance_logs")
      .select("scanned_at")
      .eq("user_id", user.id)
      .gte("scanned_at", since)
      .eq("punch_type", "check_in")
      .limit(10000);
    if (error) throw error;

    // Build 7×24 grid and track malformed rows
    const grid = {};
    let total = 0;
    let malformed = 0;
    for (const row of data ?? []) {
      try {
        const d = new Date(row.scanned_at);
        if (isNaN(d.getTime())) throw new Error("Invalid timestamp");
        const dayStr = d.toLocaleString("en-US", { timeZone: tz, weekday: "short" });
        const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayStr);
        const hour = parseInt(d.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }), 10);
        if (dayIdx < 0 || isNaN(hour)) throw new Error("Parse error");
        const key = `${dayIdx}-${hour}`;
        grid[key] = (grid[key] ?? 0) + 1;
        total++;
      } catch (_) {
        malformed++;
      }
    }

    const cells = [];
    let peak = { day: 0, hour: 0, count: 0 };
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const count = grid[`${day}-${hour}`] ?? 0;
        cells.push({ day, hour, count });
        if (count > peak.count) peak = { day, hour, count };
      }
    }

    return res.status(200).json({
      success: true,
      lookback_days: lookbackDays,
      total,
      malformed,
      peak,
      cells,
    });
  } catch (err) {
    console.error("[heatmap] Internal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
