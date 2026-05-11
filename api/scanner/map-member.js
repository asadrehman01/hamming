/**
 * api/scanner/map-member.js
 * POST /api/scanner/map-member
 *
 * Body: { device_user_id: string, customer_id: string }
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";
import { applyMemberMapping } from "./_scannerMapHelper.js";

export default async function handler(req, res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
  const requestOrigin = req.headers?.origin || "";
  if (allowedOrigins.length && !allowedOrigins.includes(requestOrigin)) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const deviceUserId = String(body?.device_user_id ?? "").trim();
    const customerId   = String(body?.customer_id    ?? "").trim();

    if (!deviceUserId) return res.status(400).json({ error: "device_user_id is required." });
    if (!customerId)   return res.status(400).json({ error: "customer_id is required." });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Verify customer belongs to this gym
    const { data: customer, error: ce } = await admin
      .from("customers")
      .select("id, first_name, last_name")
      .eq("id", customerId)
      .eq("gym_id", user.id)
      .maybeSingle();

    if (ce) throw ce;
    if (!customer) return res.status(404).json({ error: "Customer not found." });

    const { logged } = await applyMemberMapping(admin, user.id, deviceUserId, customerId);

    return res.status(200).json({
      success: true,
      device_user_id:    deviceUserId,
      customer_id:       customerId,
      customer_name:     `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
      retroactive_count: logged,
    });

  } catch (err) {
    console.error("[api/scanner/map-member] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
