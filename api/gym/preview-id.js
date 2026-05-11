/**
 * api/gym/preview-id.js
 * POST /api/gym/preview-id
 *
 * Body: { id_format, id_padding }
 *
 * Read-only. Does NOT save or increment anything.
 * Returns what the NEXT member ID would look like using the provided format
 * and the gym's current counter value (or 1 if no settings exist yet).
 *
 * Used by the frontend to show a live preview while the owner types.
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";
import { formatMemberId } from "../_gymMemberId.js";

const getToken = (req) => {
  const h = req.headers?.authorization || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
};

const parseBody = (req) => {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const supabaseUrl     = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey  = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getToken(req);
    if (!token) return res.status(401).json({ error: "Missing auth token." });

    const { data: { user }, error: ae } =
      await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(token);
    if (ae || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    const body      = parseBody(req);
    const format    = String(body?.id_format  ?? "");
    const padding   = Math.min(Math.max(Number(body?.id_padding ?? 3), 1), 8);

    // Read current counter — default 1 if no settings row yet
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: settings } = await admin
      .from("gym_settings")
      .select("id_counter")
      .eq("user_id", user.id)
      .maybeSingle();

    const counter = settings?.id_counter ?? 1;

    // Pure formatting — no DB write, no increment
    const preview = formatMemberId(format, counter, padding);

    return res.status(200).json({
      success: true,
      preview,
      counter,
      format,
      padding,
    });

  } catch (err) {
    console.error("[gym/preview-id]", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
