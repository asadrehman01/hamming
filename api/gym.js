import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";

const setupCors = (req, res, methods = "GET, POST, OPTIONS") => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return true;
};

const parseBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
};

const DEFAULTS = { id_format: "", id_padding: 3, id_counter: 1 };

const validateFormat = (value) => {
  const text = String(value ?? "");
  if (text.length > 10) return "id_format must be 10 characters or fewer.";
  if (text.length > 0 && !/^[a-zA-Z0-9_-]+$/.test(text)) {
    return "id_format may only contain letters, digits, hyphens, and underscores.";
  }
  return null;
};

const validatePadding = (value) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 2 || number > 6) {
    return "id_padding must be an integer between 2 and 6.";
  }
  return null;
};

const getAction = (req, fallbackAction = "id-settings") => {
  const body = parseBody(req);
  const url = new URL(req.url || "http://localhost");
  const pathname = url.pathname.replace(/\/+$/, "");
  const pathAction = pathname.startsWith("/api/gym/") ? pathname.slice("/api/gym/".length) : "";

  return String(req.query?.type || req.query?.action || body?.action || pathAction || fallbackAction).toLowerCase();
};

export const formatMemberId = (format, counter, padding) => {
  let safeCounter = Number(counter);
  if (!Number.isFinite(safeCounter) || Number.isNaN(safeCounter)) {
    safeCounter = 1;
  } else {
    safeCounter = Math.max(1, Math.floor(safeCounter));
  }

  let safePadding = Number(padding);
  if (!Number.isFinite(safePadding) || Number.isNaN(safePadding)) {
    safePadding = 0;
  } else {
    safePadding = Math.max(0, Math.floor(safePadding));
  }

  const prefix = String(format ?? "");
  const numeric = String(safeCounter);
  return prefix + numeric.padStart(safePadding, "0");
};

export async function generateGymMemberId(userId, adminClient) {
  if (!userId) {
    throw new Error("generateGymMemberId: userId is required.");
  }
  if (!adminClient) {
    throw new Error("generateGymMemberId: adminClient is required.");
  }

  const { data, error } = await adminClient.rpc("generate_gym_member_id", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Member ID generation failed: ${error.message}`);
  }

  if (typeof data !== "string" || !data) {
    throw new Error("Member ID generation returned an unexpected value.");
  }

  return data;
}

export async function previewGymMemberId(userId, adminClient) {
  if (!userId) {
    throw new Error("previewGymMemberId: userId is required.");
  }
  if (!adminClient) {
    throw new Error("previewGymMemberId: adminClient is required.");
  }

  const { data, error } = await adminClient
    .from("gym_settings")
    .select("id_format, id_counter, id_padding")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read gym settings: ${error.message}`);
  }

  const format = data?.id_format ?? "";
  const counter = data?.id_counter ?? 1;
  const padding = data?.id_padding ?? 3;

  return formatMemberId(format, counter, padding);
}

const handleIdSettings = async (req, res, user, admin) => {
  if (req.method === "GET") {
    const { data, error } = await admin
      .from("gym_settings")
      .select("id_format, id_counter, id_padding, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const settings = data
      ? {
          id_format: data.id_format,
          id_counter: data.id_counter,
          id_padding: data.id_padding,
          updated_at: data.updated_at,
        }
      : { ...DEFAULTS, updated_at: null };

    return res.status(200).json({ success: true, settings, ...settings });
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    const formatError = validateFormat(body?.id_format);
    const paddingError = validatePadding(body?.id_padding);
    if (formatError || paddingError) {
      return res.status(422).json({ error: [formatError, paddingError].filter(Boolean).join(" ") });
    }

    const newFormat = String(body.id_format ?? "");
    const newPadding = Number(body.id_padding);

    const { data: existing } = await admin.from("gym_settings").select("id").eq("user_id", user.id).maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await admin
        .from("gym_settings")
        .update({ id_format: newFormat, id_padding: newPadding, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select("id_format, id_counter, id_padding, updated_at")
        .single();
      if (error) {
        throw error;
      }
      result = data;
    } else {
      const { data, error } = await admin
        .from("gym_settings")
        .insert({ user_id: user.id, id_format: newFormat, id_padding: newPadding, id_counter: DEFAULTS.id_counter })
        .select("id_format, id_counter, id_padding, updated_at")
        .single();
      if (error) {
        throw error;
      }
      result = data;
    }

    return res.status(200).json({ success: true, settings: result, ...result });
  }

  return res.status(405).json({ error: "Method not allowed" });
};

const handlePreviewId = async (req, res, user, admin) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req);
  const format = String(body?.id_format ?? "");
  const padding = Math.min(Math.max(Number(body?.id_padding ?? 3), 1), 8);

  const { data: settings } = await admin.from("gym_settings").select("id_counter").eq("user_id", user.id).maybeSingle();
  const counter = settings?.id_counter ?? 1;
  const preview = formatMemberId(format, counter, padding);

  return res.status(200).json({ success: true, preview, counter, format, padding });
};

export default async function handler(req, res) {
  setupCors(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authorizationHeader = req.headers?.authorization || "";
    const token = authorizationHeader.toLowerCase().startsWith("bearer ") ? authorizationHeader.slice(7).trim() : "";
    if (!token) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    const { data: { user }, error: authError } = await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(token);
    if (authError || !user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const action = getAction(req);

    switch (action) {
      case "id-settings":
      case "settings":
        return handleIdSettings(req, res, user, admin);
      case "preview-id":
        return handlePreviewId(req, res, user, admin);
      default:
        return res.status(400).json({ error: `Invalid gym action: ${action}` });
    }
  } catch (error) {
    console.error("[gym] Internal error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Server error" });
  }
}
