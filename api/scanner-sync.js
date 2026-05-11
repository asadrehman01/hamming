/**
 * api/scanner-sync.js — Manual sync endpoint (user-triggered)
 *
 * POST /api/scanner-sync
 * Body (optional overrides): { ip_address, port, force }
 *
 * Delegates to _pollCore.pollSingleScanner for the full 7-step pipeline.
 * Setting force=true bypasses the enabled flag so the user can manually
 * sync even when auto-sync is disabled.
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";
import { pollSingleScanner } from "./_pollCore.js";

const getBearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
};

const parseBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
};

export default async function handler(req, res) {
  // Restrict CORS origins via allowlist
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
  const requestOrigin = req.headers?.origin || "";
  if (allowedOrigins.length && !allowedOrigins.includes(requestOrigin)) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabaseUrl    = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey  = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return res.status(500).json({ success: false, error: "Server configuration error." });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "Missing Authorization bearer token." });
    }

    const userClient  = createClient(supabaseUrl, supabaseAnonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // ── Load scanner settings for this user ───────────────────────────────────
    const { data: scannerRow, error: settingsError } = await adminClient
      .from("scanner_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      console.error("[scanner-sync] Failed to load scanner settings:", settingsError.message);
      return res.status(500).json({ success: false, error: "Failed to load scanner settings." });
    }

    // Allow body to override IP/port (unsaved settings preview)
    const body = parseBody(req);
    const overrideIp   = String(body?.ip_address ?? "").trim();
    const overridePort = body?.port ? Number(body.port) : null;

    // Validate port if provided
    if (overridePort !== null && (!Number.isFinite(overridePort) || overridePort < 1 || overridePort > 65535)) {
      return res.status(400).json({ success: false, error: "Invalid port number. Must be 1-65535." });
    }

    const effectiveScanner = {
      ...(scannerRow ?? {}),
      user_id: user.id,
      ip_address: overrideIp || scannerRow?.ip_address || "",
      port:       overridePort ?? scannerRow?.port ?? 4370,
      // force=true means ignore the enabled flag for manual sync
      enabled:    true,
      sync_interval_minutes: scannerRow?.sync_interval_minutes ?? 15,
      failed_attempts:       scannerRow?.failed_attempts ?? 0,
      last_synced_at:        scannerRow?.last_synced_at ?? null,
      id:                    scannerRow?.id ?? null,
    };

    if (!effectiveScanner.ip_address) {
      return res.status(400).json({ success: false, error: "No scanner IP configured. Save your settings first." });
    }

    // ── Run the 7-step poll pipeline ──────────────────────────────────────────
    const result = await pollSingleScanner(adminClient, effectiveScanner);

    return res.status(200).json({
      success: result.error === null,
      inserted:         result.inserted,
      matched:          result.matched,
      unmatched:        result.unmatched,
      expired:          result.expired,
      skipped:          result.skipped,
      total_on_device:  result.inserted + result.skipped,
      synced_at:        result.error ? undefined : new Date().toISOString(),
      error:            result.error ?? undefined,
    });

  } catch (err) {
    console.error("[scanner-sync] Unhandled error:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
