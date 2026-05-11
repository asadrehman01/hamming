/**
 * api/gym/id-settings.js
 * GET  /api/gym/id-settings  — fetch current ID format settings (or defaults)
 * POST /api/gym/id-settings  — update format + padding (never resets counter)
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULTS = { id_format: "", id_counter: 1, id_padding: 3 };

const getToken = (req) => {
  const h = req.headers?.authorization || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
};

const parseBody = (req) => {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
};

/**
 * Validate id_format: string, max 10 chars, only letters/digits/hyphen/underscore.
 */
const validateFormat = (value) => {
  const s = String(value ?? "");
  if (s.length > 10) return "id_format must be 10 characters or fewer.";
  if (s.length > 0 && !/^[a-zA-Z0-9_-]+$/.test(s))
    return "id_format may only contain letters, digits, hyphens, and underscores.";
  return null;
};

/**
 * Validate id_padding: integer between 2 and 6 inclusive.
 */
const validatePadding = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2 || n > 6)
    return "id_padding must be an integer between 2 and 6.";
  return null;
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method))
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const supabaseUrl     = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey  = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getToken(req);
    if (!token) return res.status(401).json({ error: "Missing auth token." });

    const { data: { user }, error: ae } =
      await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(token);
    if (ae || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // ── GET ────────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const { data, error } = await admin
        .from("gym_settings")
        .select("id_format, id_counter, id_padding, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        settings: data
          ? { id_format: data.id_format, id_counter: data.id_counter, id_padding: data.id_padding, updated_at: data.updated_at }
          : { ...DEFAULTS, updated_at: null },
      });
    }

    // ── POST ───────────────────────────────────────────────────────────────────
    const body = parseBody(req);

    // Validate
    const formatErr  = validateFormat(body?.id_format);
    const paddingErr = validatePadding(body?.id_padding);
    const validationErrors = [formatErr, paddingErr].filter(Boolean);
    if (validationErrors.length) {
      return res.status(422).json({ error: validationErrors.join(" ") });
    }

    const newFormat  = String(body.id_format ?? "");
    const newPadding = Number(body.id_padding);

    // Check whether a settings row already exists
    const { data: existing } = await admin
      .from("gym_settings")
      .select("id, id_counter")
      .eq("user_id", user.id)
      .maybeSingle();

    let result;

    if (existing) {
      // UPDATE — only format + padding. Counter is NEVER touched.
      const { data, error: ue } = await admin
        .from("gym_settings")
        .update({
          id_format:  newFormat,
          id_padding: newPadding,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select("id_format, id_counter, id_padding, updated_at")
        .single();

      if (ue) throw ue;
      result = data;
    } else {
      // INSERT with defaults for counter
      const { data, error: ie } = await admin
        .from("gym_settings")
        .insert({
          user_id:    user.id,
          id_format:  newFormat,
          id_padding: newPadding,
          id_counter: DEFAULTS.id_counter,
        })
        .select("id_format, id_counter, id_padding, updated_at")
        .single();

      if (ie) throw ie;
      result = data;
    }

    return res.status(200).json({ success: true, settings: result });

  } catch (err) {
    console.error("[gym/id-settings]", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
