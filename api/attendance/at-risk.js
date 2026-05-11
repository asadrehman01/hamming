/**
 * api/attendance/at-risk.js
 * GET /api/attendance/at-risk
 * Returns active members who haven't visited in 14+ days (or never visited).
 * Optional: ?days=14 (override the threshold)
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

    const days = Math.max(1, Number(req.query?.days ?? 14));
    const thresholdDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Load all active members (membership not expired)
    const { data: customers, error: ce } = await admin
      .from("customers")
      .select("id, first_name, last_name, phone, membership_end_date")
      .eq("gym_id", user.id)
      .or(`membership_end_date.is.null,membership_end_date.gte.${today.toISOString().slice(0, 10)}`);

    if (ce) throw ce;
    if (!customers?.length) return res.status(200).json({ success: true, days, count: 0, members: [] });

    // Load the most recent scan per customer (only customers with attendance)
    const customerIds = customers.map((c) => c.id);
    const { data: recentLogs, error: le } = await admin
      .from("attendance_logs")
      .select("customer_id, scanned_at")
      .eq("user_id", user.id)
      .in("customer_id", customerIds)
      .order("scanned_at", { ascending: false });

    if (le) throw le;

    // Build last-visit map
    const lastVisitMap = new Map();
    for (const log of recentLogs ?? []) {
      if (!lastVisitMap.has(log.customer_id)) {
        lastVisitMap.set(log.customer_id, log.scanned_at);
      }
    }

    // Filter: no visit at all, OR last visit older than threshold
    const atRisk = customers
      .filter((c) => {
        const last = lastVisitMap.get(c.id);
        if (!last) return true; // Never visited
        return new Date(last) < thresholdDate;
      })
      .map((c) => ({
        ...c,
        last_visit: lastVisitMap.get(c.id) ?? null,
        days_since_visit: lastVisitMap.get(c.id)
          ? Math.floor((Date.now() - new Date(lastVisitMap.get(c.id)).getTime()) / 86400000)
          : null,
      }))
      .sort((a, b) => {
        // Never-visited first, then by longest absence
        if (!a.last_visit && !b.last_visit) return 0;
        if (!a.last_visit) return -1;
        if (!b.last_visit) return 1;
        return new Date(a.last_visit) - new Date(b.last_visit);
      });

    return res.status(200).json({
      success: true,
      days,
      count: atRisk.length,
      members: atRisk,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
