
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";

/**
 * api/scanner-manage.js
 * Consolidated handler for scanner management endpoints.
 * Handles: auto-map, map-member, settings, unmapped-ids, unmatched
 */

const setupCors = (req, res, methods = "GET, POST, OPTIONS") => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
  const requestOrigin = req.headers?.origin || "";
  if (allowedOrigins.length && !allowedOrigins.includes(requestOrigin)) {
    return false;
  }
  res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return true;
};

const parseBody = (req) => {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
};

export default async function handler(req, res) {
  if (!setupCors(req, res)) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const supabaseUrl     = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey  = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const h = req.headers?.authorization || "";
    const t = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    if (!t) return res.status(401).json({ error: "Missing auth token." });

    const { data: { user }, error: ae } = await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(t);
    if (ae || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const type = req.query?.type || "settings";

    switch (type) {
      case "settings":
        return await handleSettings(req, res, user, admin);
      case "unmatched":
        return await handleUnmatched(req, res, user, admin);
      case "unmapped-ids":
        return await handleUnmappedIds(req, res, user, admin);
      case "map-member":
        return await handleMapMember(req, res, user, admin);
      case "auto-map":
        return await handleAutoMap(req, res, user, admin);
      default:
        return res.status(400).json({ error: `Invalid scanner management type: ${type}` });
    }
  } catch (err) {
    console.error("[scanner-manage] Internal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function applyMemberMapping(adminClient, userId, deviceUserId, customerId) {
  const { error: mapErr } = await adminClient.from("scanner_member_map").upsert(
    { user_id: userId, device_user_id: deviceUserId, customer_id: customerId },
    { onConflict: "user_id,device_user_id" }
  );
  if (mapErr) throw new Error(`scanner_member_map upsert failed: ${mapErr.message}`);

  const numericId = parseInt(deviceUserId, 10);
  if (!isNaN(numericId)) {
    await adminClient.from("customers").update({ scanner_id: numericId }).eq("id", customerId);
  }

  const { data: customer } = await adminClient
    .from("customers")
    .select("membership_end_date")
    .eq("id", customerId)
    .maybeSingle();

  const membershipEnd = customer?.membership_end_date
    ? (() => { const d = new Date(customer.membership_end_date); d.setHours(23, 59, 59, 999); return d; })()
    : null;

  const { data: scans, error: scansErr } = await adminClient
    .from("unmatched_scans")
    .select("device_user_id, scanned_at, punch_type")
    .eq("user_id", userId)
    .eq("device_user_id", deviceUserId)
    .eq("reviewed", false);

  if (scansErr) throw new Error(`unmatched_scans load failed: ${scansErr.message}`);

  const logsToUpsert = (scans ?? []).map((scan) => {
    const status = membershipEnd && new Date(scan.scanned_at) > membershipEnd ? "expired_member" : "active";
    return {
      user_id: userId,
      customer_id: customerId,
      device_user_id: deviceUserId,
      scanned_at: scan.scanned_at,
      punch_type: scan.punch_type ?? "check_in",
      matched: true,
      status,
      synced_at: new Date().toISOString(),
    };
  });

  let logged = 0;
  if (logsToUpsert.length > 0) {
    for (let i = 0; i < logsToUpsert.length; i += 100) {
      const { data: upserted } = await adminClient
        .from("attendance_logs")
        .upsert(logsToUpsert.slice(i, i + 100), { onConflict: "user_id,device_user_id,scanned_at", ignoreDuplicates: false })
        .select("id");
      logged += (upserted ?? []).length;
    }
  }

  await adminClient.from("unmatched_scans").update({ reviewed: true }).eq("user_id", userId).eq("device_user_id", deviceUserId);
  return { logged };
}

function extractNumericFromMemberId(gymMemberId) {
  if (!gymMemberId) return null;
  const match = String(gymMemberId).match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : null;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleSettings(req, res, user, admin) {
  if (req.method === "GET") {
    const { data, error } = await admin
      .from("scanner_settings")
      .select("id, brand, ip_address, port, enabled, sync_interval_minutes, last_synced_at, failed_attempts, last_failed_at, last_sync_time")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ success: true, settings: data ?? null });
  }

  if (req.method === "POST") {
    const b = parseBody(req);
    const payload = {
      user_id: user.id,
      brand: String(b?.brand ?? "zkteco").toLowerCase(),
      ip_address: String(b?.ip_address ?? "").trim(),
      port: Number(b?.port ?? 4370),
      enabled: Boolean(b?.enabled ?? true),
      sync_interval_minutes: Number(b?.sync_interval_minutes ?? 15),
      updated_at: new Date().toISOString(),
    };
    if (!payload.ip_address) return res.status(400).json({ error: "ip_address is required." });
    const { data, error } = await admin.from("scanner_settings").upsert(payload, { onConflict: "user_id" }).select().single();
    if (error) throw error;
    return res.status(200).json({ success: true, settings: data });
  }
}

async function handleUnmatched(req, res, user, admin) {
  const { data, error } = await admin
    .from("unmatched_scans")
    .select("device_user_id, scanned_at")
    .eq("user_id", user.id)
    .eq("reviewed", false)
    .order("scanned_at", { ascending: false });

  if (error) throw error;
  const grouped = {};
  for (const row of data ?? []) {
    if (!grouped[row.device_user_id]) grouped[row.device_user_id] = { device_user_id: row.device_user_id, scan_count: 0, last_seen: row.scanned_at };
    grouped[row.device_user_id].scan_count++;
  }
  const items = Object.values(grouped).sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
  return res.status(200).json({ success: true, count: items.length, items });
}

async function handleUnmappedIds(req, res, user, admin) {
  const { data: rawScans, error: se } = await admin
    .from("unmatched_scans")
    .select("device_user_id, scanned_at")
    .eq("user_id", user.id)
    .eq("reviewed", false)
    .order("scanned_at", { ascending: true });

  if (se) throw se;
  const grouped = new Map();
  for (const row of rawScans ?? []) {
    const uid = row.device_user_id;
    if (!grouped.has(uid)) grouped.set(uid, { device_user_id: uid, scan_count: 0, first_seen: row.scanned_at, last_seen: row.scanned_at });
    const entry = grouped.get(uid);
    entry.scan_count++;
    if (row.scanned_at < entry.first_seen) entry.first_seen = row.scanned_at;
    if (row.scanned_at > entry.last_seen) entry.last_seen = row.scanned_at;
  }
  const unmapped = [...grouped.values()].sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
  const { data: customers, error: ce } = await admin
    .from("customers")
    .select("id, first_name, last_name, gym_member_id, phone")
    .eq("gym_id", user.id)
    .order("first_name", { ascending: true });

  if (ce) throw ce;
  return res.status(200).json({
    success: true,
    unmapped_count: unmapped.length,
    unmapped,
    customers: (customers ?? []).map((c) => ({
      id: c.id,
      name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
      gym_member_id: c.gym_member_id ?? null,
      phone: c.phone ?? null,
    })),
  });
}

async function handleMapMember(req, res, user, admin) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = parseBody(req);
  const deviceUserId = String(body?.device_user_id ?? "").trim();
  const customerId = String(body?.customer_id ?? "").trim();

  if (!deviceUserId || !customerId) return res.status(400).json({ error: "device_user_id and customer_id are required." });

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
    device_user_id: deviceUserId,
    customer_id: customerId,
    customer_name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
    retroactive_count: logged,
  });
}

async function handleAutoMap(req, res, user, admin) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { data: unmatched, error: ue } = await admin
    .from("unmatched_scans")
    .select("device_user_id")
    .eq("user_id", user.id)
    .eq("reviewed", false);
  if (ue) throw ue;
  const deviceIds = [...new Set((unmatched ?? []).map((r) => r.device_user_id))];
  if (!deviceIds.length) return res.status(200).json({ success: true, auto_mapped: 0, mappings: [], message: "No unmatched scans." });

  const { data: customers, error: ce } = await admin
    .from("customers")
    .select("id, first_name, last_name, gym_member_id")
    .eq("gym_id", user.id)
    .not("gym_member_id", "is", null);
  if (ce) throw ce;

  const numericMap = new Map();
  for (const c of customers ?? []) {
    const n = extractNumericFromMemberId(c.gym_member_id);
    if (n !== null) numericMap.set(n, c);
  }

  const { data: existingMaps } = await admin.from("scanner_member_map").select("device_user_id").eq("user_id", user.id);
  const alreadyMapped = new Set((existingMaps ?? []).map((r) => r.device_user_id));

  const mappings = [];
  let autoMapped = 0, stillUnmatched = 0;

  for (const deviceId of deviceIds) {
    if (alreadyMapped.has(deviceId)) continue;
    const numeric = parseInt(deviceId, 10);
    const customer = !isNaN(numeric) ? numericMap.get(numeric) : null;
    if (!customer) { stillUnmatched++; continue; }
    try {
      await applyMemberMapping(admin, user.id, deviceId, customer.id);
      autoMapped++;
      mappings.push({ device_user_id: deviceId, matched_to_name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(), matched_to_gym_member_id: customer.gym_member_id, matched_to_customer_id: customer.id });
    } catch (mapErr) {
      console.error(`[auto-map] Failed mapping device ${deviceId}:`, mapErr.message);
      stillUnmatched++;
    }
  }
  return res.status(200).json({ success: true, auto_mapped: autoMapped, still_unmatched: stillUnmatched, mappings });
}
