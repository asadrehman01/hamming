/**
 * api/scanner-enroll.js — Enroll a device UID → customer mapping
 *
 * POST /api/scanner-enroll
 * Body: { device_user_id: string, customer_id: uuid }
 *
 * Steps:
 *  1. Upsert into scanner_member_map
 *  2. Retroactively backfill all historical attendance_logs for that device UID
 *  3. Mark unmatched_scans rows as reviewed
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";

const getBearerToken = (req) => {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
};

const parseBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
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
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const supabaseUrl     = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey  = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return res.status(500).json({ success: false, error: "Server configuration error." });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ success: false, error: "Missing auth token." });

    const userClient  = createClient(supabaseUrl, supabaseAnonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id) return res.status(401).json({ success: false, error: "Unauthorized" });

    const body = parseBody(req);

    // ── DELETE: remove a mapping ─────────────────────────────────────────────
    if (req.method === "DELETE") {
      const deviceUserId = String(body?.device_user_id ?? "").trim();
      if (!deviceUserId) return res.status(400).json({ success: false, error: "device_user_id is required." });

      const { error: delErr } = await adminClient.from("scanner_member_map")
        .delete()
        .eq("user_id", user.id)
        .eq("device_user_id", deviceUserId);

      if (delErr) {
        console.error("[scanner-enroll] DELETE scanner_member_map failed:", delErr.message);
      }

      // Reset attendance_logs back to unmatched
      const { error: logErr } = await adminClient.from("attendance_logs")
        .update({ customer_id: null, matched: false, status: "unknown" })
        .eq("user_id", user.id)
        .eq("device_user_id", deviceUserId);

      if (logErr) {
        console.error("[scanner-enroll] DELETE attendance_logs update failed:", logErr.message);
      }

      // Restore unmatched_scans reviewed flag
      const { error: unmErr } = await adminClient.from("unmatched_scans")
        .update({ reviewed: false })
        .eq("user_id", user.id)
        .eq("device_user_id", deviceUserId);

      if (unmErr) {
        console.error("[scanner-enroll] DELETE unmatched_scans update failed:", unmErr.message);
      }

      return res.status(200).json({ success: true });
    }

    // ── POST: create / update a mapping ─────────────────────────────────────
    const deviceUserId = String(body?.device_user_id ?? "").trim();
    const customerId   = String(body?.customer_id ?? "").trim();

    if (!deviceUserId) return res.status(400).json({ success: false, error: "device_user_id is required." });
    if (!customerId)   return res.status(400).json({ success: false, error: "customer_id is required." });

    // 1. Upsert mapping
    const { error: mapErr } = await adminClient.from("scanner_member_map").upsert(
      { user_id: user.id, device_user_id: deviceUserId, customer_id: customerId },
      { onConflict: "user_id,device_user_id" }
    );
    if (mapErr) throw new Error(`Failed to save mapping: ${mapErr.message}`);

    // 2. Load customer subscription date for status calculation
    const { data: customer } = await adminClient
      .from("customers")
      .select("id, membership_end_date")
      .eq("id", customerId)
      .maybeSingle();

    const membershipEnd = customer?.membership_end_date ?? null;

    // 3. Load all historical attendance_logs for this device UID
    //    Fixed: use device_user_id (correct column) instead of scanner_uid
    const { data: logs } = await adminClient
      .from("attendance_logs")
      .select("id, scanned_at")
      .eq("user_id", user.id)
      .eq("device_user_id", deviceUserId);

    // 4. Retroactive backfill with correct subscription status per scan
    let backfilled = 0;
    if (logs?.length) {
      const updates = logs.map((log) => {
        let status = "active";
        if (membershipEnd) {
          const endDate = new Date(membershipEnd);
          endDate.setHours(23, 59, 59, 999);
          if (new Date(log.scanned_at) > endDate) status = "expired_member";
        }
        return { id: log.id, customer_id: customerId, matched: true, status };
      });

      // Batch update in chunks of 100
      for (let i = 0; i < updates.length; i += 100) {
        const chunk = updates.slice(i, i + 100);
        const { data: updated, error: chunkErr } = await adminClient
          .from("attendance_logs")
          .upsert(chunk)
          .select("id");

        if (chunkErr) {
          console.error(`[scanner-enroll] Backfill chunk ${i} failed:`, chunkErr.message);
        } else {
          backfilled += (updated ?? []).length;
        }
      }
    }

    // 5. Mark unmatched_scans as reviewed
    const { error: reviewErr } = await adminClient.from("unmatched_scans")
      .update({ reviewed: true })
      .eq("user_id", user.id)
      .eq("device_user_id", deviceUserId);

    if (reviewErr) {
      console.error("[scanner-enroll] Mark reviewed failed:", reviewErr.message);
    }

    return res.status(200).json({ success: true, backfilled, device_user_id: deviceUserId, customer_id: customerId });

  } catch (err) {
    console.error("[scanner-enroll] Error:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
