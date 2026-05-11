/**
 * api/scanner/auto-map.js
 * POST /api/scanner/auto-map
 *
 * Attempts to automatically match unmatched device_user_ids to customers
 * by comparing the numeric portion of device_user_id to the numeric suffix
 * of each customer's gym_member_id.
 *
 * Returns:
 *   { auto_mapped, still_unmatched, mappings: [{ device_user_id, matched_to_name, matched_to_gym_member_id }] }
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";
import { applyMemberMapping, extractNumericFromMemberId } from "./_scannerMapHelper.js";

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

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // ── 1. Load all distinct unreviewed device UIDs ────────────────────────────
    const { data: rawScans, error: se } = await admin
      .from("unmatched_scans")
      .select("device_user_id")
      .eq("user_id", user.id)
      .eq("reviewed", false);

    if (se) throw se;

    const deviceIds = [...new Set((rawScans ?? []).map((r) => r.device_user_id))];

    if (deviceIds.length === 0) {
      return res.status(200).json({
        success: true,
        auto_mapped:     0,
        still_unmatched: 0,
        mappings:        [],
      });
    }

    // ── 2. Load all customers with a gym_member_id ─────────────────────────────
    const { data: customers, error: ce } = await admin
      .from("customers")
      .select("id, first_name, last_name, gym_member_id")
      .eq("gym_id", user.id)
      .not("gym_member_id", "is", null);

    if (ce) throw ce;

    const numericMap = new Map(); 
    const ambiguous  = new Set(); 
    for (const c of customers ?? []) {
      const n = extractNumericFromMemberId(c.gym_member_id);
      if (n === null) continue;
      if (numericMap.has(n)) {
        ambiguous.add(n); 
      } else {
        numericMap.set(n, c);
      }
    }
    for (const n of ambiguous) numericMap.delete(n);

    // ── 3. Also check existing scanner_member_map to skip already-mapped IDs ──
    const { data: existingMaps } = await admin
      .from("scanner_member_map")
      .select("device_user_id")
      .eq("user_id", user.id);

    const alreadyMapped = new Set((existingMaps ?? []).map((r) => r.device_user_id));

    // ── 4. Attempt matching for each unmatched device ID ─────────────────────
    const mappings     = [];
    let   autoMapped   = 0;
    let   stillUnmatched = 0;

    for (const deviceId of deviceIds) {
      if (alreadyMapped.has(deviceId)) continue; 

      const numeric   = parseInt(deviceId, 10);
      const customer  = !isNaN(numeric) ? numericMap.get(numeric) : null;

      if (!customer) {
        stillUnmatched++;
        continue;
      }

      try {
        await applyMemberMapping(admin, user.id, deviceId, customer.id);
        autoMapped++;
        mappings.push({
          device_user_id:          deviceId,
          matched_to_name:         `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
          matched_to_gym_member_id: customer.gym_member_id,
          matched_to_customer_id:  customer.id,
        });
      } catch (mapErr) {
        console.error(`[auto-map] Failed mapping device ${deviceId}:`, mapErr.message);
        stillUnmatched++;
      }
    }

    return res.status(200).json({
      success:         true,
      auto_mapped:     autoMapped,
      still_unmatched: stillUnmatched,
      mappings,
    });

  } catch (err) {
    console.error("[api/scanner/auto-map] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
