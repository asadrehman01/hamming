/**
 * api/scanner/settings.js
 * GET  /api/scanner/settings — fetch current scanner config
 * POST /api/scanner/settings — upsert scanner config
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";

const token = (req) => {
  const h = req.headers?.authorization || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
};
const body = (req) => {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
};

export default async function handler(req, res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
  const requestOrigin = req.headers?.origin || "";
  if (allowedOrigins.length && !allowedOrigins.includes(requestOrigin)) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });

  try {
    const supabaseUrl     = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey  = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const t = token(req);
    if (!t) return res.status(401).json({ error: "Missing auth token." });

    const { data: { user }, error: ae } = await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(t);
    if (ae || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("scanner_settings")
        .select("id, brand, ip_address, port, enabled, sync_interval_minutes, last_synced_at, failed_attempts, last_failed_at, last_sync_time")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ success: true, settings: data ?? null });
    }

    // POST — upsert
    const b = body(req);
    const payload = {
      user_id:                user.id,
      brand:                  String(b?.brand   ?? "zkteco").toLowerCase(),
      ip_address:             String(b?.ip_address ?? "").trim(),
      port:                   Number(b?.port ?? 4370),
      enabled:                Boolean(b?.enabled ?? true),
      sync_interval_minutes:  Number(b?.sync_interval_minutes ?? 15),
      updated_at:             new Date().toISOString(),
    };

    if (!payload.ip_address) return res.status(400).json({ error: "ip_address is required." });

    const { data, error } = await admin
      .from("scanner_settings")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;

    return res.status(200).json({ success: true, settings: data });
  } catch (err) {
    console.error("[api/scanner/settings] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
