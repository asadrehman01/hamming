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
 *   total: 1234
 * }
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

    const lookbackDays = Math.min(Math.max(1, Number(req.query?.days ?? 90)), 365);
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const tz = String(req.query?.tz ?? "UTC");

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Fetch timestamps only — we aggregate in JS to avoid needing pg functions
    const { data, error } = await admin
      .from("attendance_logs")
      .select("scanned_at")
      .eq("user_id", user.id)
      .gte("scanned_at", since)
      .eq("punch_type", "check_in"); // heatmap shows check-ins only

    if (error) throw error;

    // Build 7×24 grid
    const grid = {}; // "day-hour" → count
    let total = 0;

    for (const row of data ?? []) {
      try {
        const d = new Date(row.scanned_at);
        const localStr = d.toLocaleString("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false });
        // Parse day and hour from locale string
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const day  = dayNames.indexOf(localStr.split(",")[0]);
        const hour = parseInt(d.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }), 10);
        if (day < 0 || isNaN(hour)) continue;
        const key = `${day}-${hour}`;
        grid[key] = (grid[key] ?? 0) + 1;
        total++;
      } catch { /* skip malformed timestamps */ }
    }

    // Build flat cells array
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
      peak,
      cells,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
