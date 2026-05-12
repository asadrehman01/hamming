
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";
import { formatMemberId } from "./_gymMemberId.js";

/**
 * api/gym-manage.js
 * Consolidated handler for gym settings endpoints.
 * Handles: id-settings, preview-id
 */

const setupCors = (req, res, methods = "GET, POST, OPTIONS") => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return true;
};

const parseBody = (req) => {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
};

const DEFAULTS = { id_format: "", id_padding: 3, id_counter: 1 };

const validateFormat = (value) => {
  const s = String(value ?? "");
  if (s.length > 10) return "id_format must be 10 characters or fewer.";
  if (s.length > 0 && !/^[a-zA-Z0-9_-]+$/.test(s))
    return "id_format may only contain letters, digits, hyphens, and underscores.";
  return null;
};

const validatePadding = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2 || n > 6)
    return "id_padding must be an integer between 2 and 6.";
  return null;
};

export default async function handler(req, res) {
  setupCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const supabaseUrl     = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey  = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const h = req.headers?.authorization || "";
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Missing auth token." });

    const { data: { user }, error: ae } = await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(token);
    if (ae || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const type = req.query?.type || "id-settings";

    switch (type) {
      case "id-settings":
        return await handleIdSettings(req, res, user, admin);
      case "preview-id":
        return await handlePreviewId(req, res, user, admin);
      default:
        return res.status(400).json({ error: `Invalid gym management type: ${type}` });
    }
  } catch (err) {
    console.error("[gym-manage] Internal error:", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}

async function handleIdSettings(req, res, user, admin) {
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

  if (req.method === "POST") {
    const body = parseBody(req);
    const formatErr = validateFormat(body?.id_format);
    const paddingErr = validatePadding(body?.id_padding);
    if (formatErr || paddingErr) return res.status(422).json({ error: [formatErr, paddingErr].filter(Boolean).join(" ") });

    const newFormat = String(body.id_format ?? "");
    const newPadding = Number(body.id_padding);

    const { data: existing } = await admin.from("gym_settings").select("id").eq("user_id", user.id).maybeSingle();

    let result;
    if (existing) {
      const { data, error: ue } = await admin.from("gym_settings").update({ id_format: newFormat, id_padding: newPadding, updated_at: new Date().toISOString() }).eq("user_id", user.id).select("id_format, id_counter, id_padding, updated_at").single();
      if (ue) throw ue;
      result = data;
    } else {
      const { data, error: ie } = await admin.from("gym_settings").insert({ user_id: user.id, id_format: newFormat, id_padding: newPadding, id_counter: DEFAULTS.id_counter }).select("id_format, id_counter, id_padding, updated_at").single();
      if (ie) throw ie;
      result = data;
    }
    return res.status(200).json({ success: true, settings: result });
  }
  return res.status(405).json({ error: "Method not allowed" });
}

async function handlePreviewId(req, res, user, admin) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = parseBody(req);
  const format = String(body?.id_format ?? "");
  const padding = Math.min(Math.max(Number(body?.id_padding ?? 3), 1), 8);

  const { data: settings } = await admin.from("gym_settings").select("id_counter").eq("user_id", user.id).maybeSingle();
  const counter = settings?.id_counter ?? 1;
  const preview = formatMemberId(format, counter, padding);

  return res.status(200).json({ success: true, preview, counter, format, padding });
}
