
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";

/**
 * api/attendance.js
 * Consolidated handler for all attendance-related endpoints.
 * Handles: today, heatmap, member, at-risk
 */

const setupCors = (req, res) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
  const requestOrigin = req.headers?.origin || "";
  if (allowedOrigins.length && !allowedOrigins.includes(requestOrigin)) {
    return false;
  }
  res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return true;
};

export default async function handler(req, res) {
  if (!setupCors(req, res)) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }
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
    const type = req.query?.type || "today";

    switch (type) {
      case "today":
        return await handleToday(req, res, user, admin);
      case "heatmap":
        return await handleHeatmap(req, res, user, admin);
      case "member":
        return await handleMember(req, res, user, admin);
      case "at-risk":
        return await handleAtRisk(req, res, user, admin);
      default:
        return res.status(400).json({ error: `Invalid attendance type: ${type}` });
    }
  } catch (err) {
    console.error("[attendance] Internal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function handleToday(req, res, user, admin) {
  const tz = String(req.query?.tz || "UTC");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch (_) {
    return res.status(400).json({ error: "Invalid timezone identifier" });
  }

  let todayMidnight;
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(now);
    
    const d = {};
    parts.forEach(p => { d[p.type] = p.value; });
    
    const year = parseInt(d.year, 10);
    const month = parseInt(d.month, 10) - 1;
    const day = parseInt(d.day, 10);
    
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const tzOffset = now.getTime() - localNow.getTime();
    todayMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0) + tzOffset);
  } catch (_) {
    todayMidnight = new Date();
    todayMidnight.setUTCHours(0, 0, 0, 0);
  }

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

  const uniqueCustomerIds = new Set(
    (data ?? []).filter((r) => r.customers?.id).map((r) => r.customers.id)
  );

  return res.status(200).json({
    success: true,
    date: todayMidnight.toISOString().slice(0, 10),
    total_scans: count ?? 0,
    unique_visitors: uniqueCustomerIds.size,
    logs: data ?? [],
  });
}

async function handleHeatmap(req, res, user, admin) {
  const lookbackDays = Math.min(Math.max(Number(req.query?.lookback || 30), 7), 180);
  const tz = String(req.query?.tz || "UTC");
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("attendance_logs")
    .select("scanned_at")
    .eq("user_id", user.id)
    .gte("scanned_at", since)
    .order("scanned_at", { ascending: false });

  if (error) throw error;

  const cells = {};
  let total = 0, malformed = 0;

  for (const row of data || []) {
    try {
      const d = new Date(row.scanned_at);
      const local = new Date(d.toLocaleString("en-US", { timeZone: tz }));
      const day = local.getDay();
      const hour = local.getHours();
      const key = `${day}-${hour}`;
      cells[key] = (cells[key] || 0) + 1;
      total++;
    } catch {
      malformed++;
    }
  }

  let peak = { day: null, hour: null, count: 0 };
  for (const [key, count] of Object.entries(cells)) {
    if (count > peak.count) {
      const [d, h] = key.split("-").map(Number);
      peak = { day: d, hour: h, count };
    }
  }

  return res.status(200).json({ success: true, lookback_days: lookbackDays, total, peak, cells });
}

async function handleMember(req, res, user, admin) {
  const customerId = req.query?.id ?? "";
  if (!customerId) return res.status(400).json({ error: "id (customer UUID) is required." });

  const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 500);
  const offset = Math.max(Number(req.query?.offset || 0), 0);

  const { data: customer, error: ce } = await admin
    .from("customers")
    .select("id, first_name, last_name, phone, membership_end_date")
    .eq("id", customerId)
    .eq("gym_id", user.id)
    .maybeSingle();

  if (ce) throw ce;
  if (!customer) return res.status(404).json({ error: "Customer not found." });

  const { data: logs, error: le, count } = await admin
    .from("attendance_logs")
    .select("id, device_user_id, scanned_at, punch_type, status, synced_at", { count: "exact" })
    .eq("user_id", user.id)
    .eq("customer_id", customerId)
    .order("scanned_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (le) throw le;

  return res.status(200).json({ success: true, customer, total: count ?? 0, logs: logs ?? [] });
}

async function handleAtRisk(req, res, user, admin) {
  const days = Math.max(Number(req.query?.days || 14), 1);
  const thresholdDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const { data: customers, error: ce } = await admin
    .from("customers")
    .select("id, first_name, last_name, phone, membership_end_date")
    .eq("gym_id", user.id)
    .or(`membership_end_date.is.null,membership_end_date.gte.${today.toISOString().slice(0, 10)}`);

  if (ce) throw ce;
  if (!customers?.length) return res.status(200).json({ success: true, days, count: 0, members: [] });

  const customerIds = customers.map((c) => c.id);
  const { data: recentLogs, error: le } = await admin
    .from("attendance_logs")
    .select("customer_id, scanned_at")
    .eq("user_id", user.id)
    .in("customer_id", customerIds)
    .order("scanned_at", { ascending: false });

  if (le) throw le;

  const lastVisitMap = new Map();
  for (const log of recentLogs ?? []) {
    if (!lastVisitMap.has(log.customer_id)) lastVisitMap.set(log.customer_id, log.scanned_at);
  }

  const atRisk = customers
    .filter((c) => {
      const last = lastVisitMap.get(c.id);
      return !last || new Date(last) < thresholdDate;
    })
    .map((c) => ({
      ...c,
      last_visit: lastVisitMap.get(c.id) ?? null,
      days_since_visit: lastVisitMap.get(c.id)
        ? Math.floor((Date.now() - new Date(lastVisitMap.get(c.id)).getTime()) / 86400000)
        : null,
    }))
    .sort((a, b) => {
      if (!a.last_visit && !b.last_visit) return 0;
      if (!a.last_visit) return -1;
      if (!b.last_visit) return 1;
      return new Date(a.last_visit) - new Date(b.last_visit);
    });

  return res.status(200).json({ success: true, days, count: atRisk.length, members: atRisk });
}
