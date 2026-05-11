/**
 * api/attendance/member.js
 * GET /api/attendance/member?id=<customer_uuid>
 * Returns all attendance_logs for one member, newest first.
 * Optional: ?limit=50&offset=0
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";

export default async function handler(req, res) {
  // Restrict CORS origins via allowlist
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

    const customerId = req.query?.id ?? "";
    if (!customerId) return res.status(400).json({ error: "id (customer UUID) is required." });

    // Sanitize limit and offset to prevent NaN or negative values
    const rawLimit = Number(req.query?.limit ?? 100);
    const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(Math.floor(rawLimit), 500) : 100;
    const rawOffset = Number(req.query?.offset ?? 0);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Verify this customer belongs to the requesting gym owner
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

    return res.status(200).json({
      success: true,
      customer,
      total: count ?? 0,
      limit,
      offset,
      logs: logs ?? [],
    });
  } catch (err) {
    console.error("[member] Internal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
