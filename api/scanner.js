import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import net from "node:net";
import { getEnv } from "./_env.js";
import { pollSingleScanner } from "./_pollCore.js";

const require = createRequire(import.meta.url);
const ZKLib = require("node-zklib");

const setupCors = (req, res, methods = "GET, POST, DELETE, OPTIONS") => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
};

const getAction = (req, fallbackAction = "settings") => {
  const body = parseBody(req);
  const url = new URL(req.url || "http://localhost");
  const pathname = url.pathname.replace(/\/+$/, "");
  const pathAction = pathname.startsWith("/api/scanner/")
    ? pathname.slice("/api/scanner/".length)
    : "";

  return String(
    req.query?.type ||
      req.query?.action ||
      body?.action ||
      pathAction ||
      fallbackAction,
  ).toLowerCase();
};

const selectScannerSettings = async (admin, userId) => {
  const { data, error } = await admin
    .from("scanner_settings")
    .select(
      "id, brand, ip_address, port, enabled, sync_interval_minutes, last_synced_at, failed_attempts, last_failed_at, last_sync_time",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};

const applyMemberMapping = async (adminClient, userId, deviceUserId, customerId) => {
  const { error: mapErr } = await adminClient.from("scanner_member_map").upsert(
    { user_id: userId, device_user_id: deviceUserId, customer_id: customerId },
    { onConflict: "user_id,device_user_id" },
  );

  if (mapErr) {
    throw new Error(`scanner_member_map upsert failed: ${mapErr.message}`);
  }

  const numericId = Number.parseInt(deviceUserId, 10);
  if (!Number.isNaN(numericId)) {
    await adminClient.from("customers").update({ scanner_id: numericId }).eq("id", customerId);
  }

  const { data: customer } = await adminClient
    .from("customers")
    .select("membership_end_date")
    .eq("id", customerId)
    .maybeSingle();

  const membershipEnd = customer?.membership_end_date
    ? (() => {
        const date = new Date(customer.membership_end_date);
        date.setHours(23, 59, 59, 999);
        return date;
      })()
    : null;

  const { data: scans, error: scansErr } = await adminClient
    .from("unmatched_scans")
    .select("device_user_id, scanned_at, punch_type")
    .eq("user_id", userId)
    .eq("device_user_id", deviceUserId)
    .eq("reviewed", false);

  if (scansErr) {
    throw new Error(`unmatched_scans load failed: ${scansErr.message}`);
  }

  const logsToUpsert = (scans ?? []).map((scan) => ({
    user_id: userId,
    customer_id: customerId,
    device_user_id: deviceUserId,
    scanned_at: scan.scanned_at,
    punch_type: scan.punch_type ?? "check_in",
    matched: true,
    status: membershipEnd && new Date(scan.scanned_at) > membershipEnd ? "expired_member" : "active",
    synced_at: new Date().toISOString(),
  }));

  let logged = 0;
  if (logsToUpsert.length > 0) {
    for (let index = 0; index < logsToUpsert.length; index += 100) {
      const { data: upserted } = await adminClient
        .from("attendance_logs")
        .upsert(logsToUpsert.slice(index, index + 100), {
          onConflict: "user_id,device_user_id,scanned_at",
          ignoreDuplicates: false,
        })
        .select("id");
      logged += (upserted ?? []).length;
    }
  }

  await adminClient.from("unmatched_scans").update({ reviewed: true }).eq("user_id", userId).eq("device_user_id", deviceUserId);
  return { logged };
};

const extractNumericFromMemberId = (gymMemberId) => {
  if (!gymMemberId) return null;
  const match = String(gymMemberId).match(/(\d+)\s*$/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const handleSettings = async (req, res, user, admin) => {
  if (req.method === "GET") {
    const settings = await selectScannerSettings(admin, user.id);
    return res.status(200).json({ success: true, settings });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req);
  const existing = await selectScannerSettings(admin, user.id);
  const enabled = body?.enabled !== undefined ? Boolean(body.enabled) : true;
  const payload = {
    user_id: user.id,
    brand: String(body?.brand ?? existing?.brand ?? "zkteco").toLowerCase(),
    ip_address: String(body?.ip_address ?? existing?.ip_address ?? "").trim(),
    port: Number(body?.port ?? existing?.port ?? 4370),
    enabled,
    sync_interval_minutes: Number(body?.sync_interval_minutes ?? existing?.sync_interval_minutes ?? 15),
    updated_at: new Date().toISOString(),
  };

  if (payload.enabled && !payload.ip_address) {
    return res.status(400).json({ error: "ip_address is required." });
  }

  if (!payload.enabled && !existing) {
    return res.status(200).json({ success: true, settings: null });
  }

  const { data, error } = await admin
    .from("scanner_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return res.status(200).json({ success: true, settings: data });
};

const handleUnmatched = async (req, res, user, admin) => {
  const { data, error } = await admin
    .from("unmatched_scans")
    .select("device_user_id, scanned_at")
    .eq("user_id", user.id)
    .eq("reviewed", false)
    .order("scanned_at", { ascending: false });

  if (error) {
    throw error;
  }

  const grouped = {};
  for (const row of data ?? []) {
    if (!grouped[row.device_user_id]) {
      grouped[row.device_user_id] = {
        device_user_id: row.device_user_id,
        scan_count: 0,
        last_seen: row.scanned_at,
      };
    }
    grouped[row.device_user_id].scan_count++;
  }

  const items = Object.values(grouped).sort((left, right) => new Date(right.last_seen) - new Date(left.last_seen));
  return res.status(200).json({ success: true, count: items.length, items });
};

const handleUnmappedIds = async (req, res, user, admin) => {
  const { data: rawScans, error: scanError } = await admin
    .from("unmatched_scans")
    .select("device_user_id, scanned_at")
    .eq("user_id", user.id)
    .eq("reviewed", false)
    .order("scanned_at", { ascending: true });

  if (scanError) {
    throw scanError;
  }

  const grouped = new Map();
  for (const row of rawScans ?? []) {
    const deviceUserId = row.device_user_id;
    if (!grouped.has(deviceUserId)) {
      grouped.set(deviceUserId, {
        device_user_id: deviceUserId,
        scan_count: 0,
        first_seen: row.scanned_at,
        last_seen: row.scanned_at,
      });
    }
    const entry = grouped.get(deviceUserId);
    entry.scan_count++;
    if (row.scanned_at < entry.first_seen) entry.first_seen = row.scanned_at;
    if (row.scanned_at > entry.last_seen) entry.last_seen = row.scanned_at;
  }

  const unmapped = [...grouped.values()].sort((left, right) => new Date(right.last_seen) - new Date(left.last_seen));
  const { data: customers, error: customerError } = await admin
    .from("customers")
    .select("id, first_name, last_name, gym_member_id, phone")
    .eq("gym_id", user.id)
    .order("first_name", { ascending: true });

  if (customerError) {
    throw customerError;
  }

  return res.status(200).json({
    success: true,
    unmapped_count: unmapped.length,
    unmapped,
    customers: (customers ?? []).map((customer) => ({
      id: customer.id,
      name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
      gym_member_id: customer.gym_member_id ?? null,
      phone: customer.phone ?? null,
    })),
  });
};

const handleMapMember = async (req, res, user, admin) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req);
  const deviceUserId = String(body?.device_user_id ?? "").trim();
  const customerId = String(body?.customer_id ?? "").trim();

  if (!deviceUserId || !customerId) {
    return res.status(400).json({ error: "device_user_id and customer_id are required." });
  }

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("id, first_name, last_name")
    .eq("id", customerId)
    .eq("gym_id", user.id)
    .maybeSingle();

  if (customerError) {
    throw customerError;
  }

  if (!customer) {
    return res.status(404).json({ error: "Customer not found." });
  }

  const { logged } = await applyMemberMapping(admin, user.id, deviceUserId, customerId);
  return res.status(200).json({
    success: true,
    device_user_id: deviceUserId,
    customer_id: customerId,
    customer_name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
    retroactive_count: logged,
  });
};

const handleAutoMap = async (req, res, user, admin) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { data: unmatched, error: unmatchedError } = await admin
    .from("unmatched_scans")
    .select("device_user_id")
    .eq("user_id", user.id)
    .eq("reviewed", false);

  if (unmatchedError) {
    throw unmatchedError;
  }

  const deviceIds = [...new Set((unmatched ?? []).map((row) => row.device_user_id))];
  if (!deviceIds.length) {
    return res.status(200).json({ success: true, auto_mapped: 0, mappings: [], message: "No unmatched scans." });
  }

  const { data: customers, error: customerError } = await admin
    .from("customers")
    .select("id, first_name, last_name, gym_member_id")
    .eq("gym_id", user.id)
    .not("gym_member_id", "is", null);

  if (customerError) {
    throw customerError;
  }

  const numericMap = new Map();
  for (const customer of customers ?? []) {
    const numeric = extractNumericFromMemberId(customer.gym_member_id);
    if (numeric !== null) {
      numericMap.set(numeric, customer);
    }
  }

  const { data: existingMaps } = await admin.from("scanner_member_map").select("device_user_id").eq("user_id", user.id);
  const alreadyMapped = new Set((existingMaps ?? []).map((row) => row.device_user_id));

  const mappings = [];
  let autoMapped = 0;
  let stillUnmatched = 0;

  for (const deviceId of deviceIds) {
    if (alreadyMapped.has(deviceId)) {
      continue;
    }
    const numeric = Number.parseInt(deviceId, 10);
    const customer = Number.isNaN(numeric) ? null : numericMap.get(numeric);
    if (!customer) {
      stillUnmatched++;
      continue;
    }
    try {
      await applyMemberMapping(admin, user.id, deviceId, customer.id);
      autoMapped++;
      mappings.push({
        device_user_id: deviceId,
        matched_to_name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
        matched_to_gym_member_id: customer.gym_member_id,
        matched_to_customer_id: customer.id,
      });
    } catch (mapErr) {
      console.error(`[auto-map] Failed mapping device ${deviceId}:`, mapErr.message);
      stillUnmatched++;
    }
  }

  return res.status(200).json({ success: true, auto_mapped: autoMapped, still_unmatched: stillUnmatched, mappings });
};

const handleSync = async (req, res, user, admin) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { data: scannerRow } = await admin.from("scanner_settings").select("*").eq("user_id", user.id).maybeSingle();
  const body = parseBody(req);
  const overrideIp = String(body?.ip_address ?? body?.ip ?? "").trim();
  const overridePort = body?.port ? Number(body.port) : null;

  const effectiveScanner = {
    ...(scannerRow ?? {}),
    user_id: user.id,
    ip_address: overrideIp || scannerRow?.ip_address || "",
    port: overridePort ?? scannerRow?.port ?? 4370,
    enabled: true,
  };

  if (!effectiveScanner.ip_address) {
    return res.status(400).json({ error: "No scanner IP configured." });
  }

  const result = await pollSingleScanner(admin, effectiveScanner);
  return res.status(200).json({
    success: result.error === null,
    ...result,
    synced_at: result.error ? undefined : new Date().toISOString(),
  });
};

const handleEnroll = async (req, res, user, admin) => {
  const body = parseBody(req);
  const deviceUserId = String(body?.device_user_id ?? "").trim();
  const customerId = String(body?.customer_id ?? "").trim();

  if (req.method === "DELETE" || String(body?.action || "").toLowerCase() === "unenroll") {
    if (!deviceUserId) {
      return res.status(400).json({ error: "device_user_id is required." });
    }

    await admin.from("scanner_member_map").delete().eq("user_id", user.id).eq("device_user_id", deviceUserId);
    await admin.from("attendance_logs").update({ customer_id: null, matched: false, status: "unknown" }).eq("user_id", user.id).eq("device_user_id", deviceUserId);
    await admin.from("unmatched_scans").update({ reviewed: false }).eq("user_id", user.id).eq("device_user_id", deviceUserId);
    return res.status(200).json({ success: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!deviceUserId || !customerId) {
    return res.status(400).json({ error: "device_user_id and customer_id are required." });
  }

  await admin.from("scanner_member_map").upsert(
    { user_id: user.id, device_user_id: deviceUserId, customer_id: customerId },
    { onConflict: "user_id,device_user_id" },
  );

  const { data: customer } = await admin.from("customers").select("membership_end_date").eq("id", customerId).maybeSingle();
  const membershipEnd = customer?.membership_end_date ?? null;

  const { data: logs } = await admin.from("attendance_logs").select("id, scanned_at").eq("user_id", user.id).eq("device_user_id", deviceUserId);
  let backfilled = 0;
  if (logs?.length) {
    const updates = logs.map((log) => {
      let status = "active";
      if (membershipEnd) {
        const endDate = new Date(membershipEnd);
        endDate.setHours(23, 59, 59, 999);
        if (new Date(log.scanned_at) > endDate) {
          status = "expired_member";
        }
      }
      return { id: log.id, customer_id: customerId, matched: true, status };
    });

    for (let index = 0; index < updates.length; index += 100) {
      const { data: updated } = await admin.from("attendance_logs").upsert(updates.slice(index, index + 100)).select("id");
      backfilled += (updated ?? []).length;
    }
  }

  await admin.from("unmatched_scans").update({ reviewed: true }).eq("user_id", user.id).eq("device_user_id", deviceUserId);
  return res.status(200).json({ success: true, backfilled });
};

const handleTestConnection = async (req, res, user, admin) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req);
  const ip = String(body?.ip || body?.ip_address || "").trim();
  const port = Number(body?.port ?? 4370);

  if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return res.status(400).json({ error: "Invalid IP address format." });
  }

  const tcpProbe = (targetIp, targetPort) => new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(targetPort, targetIp);
  });

  const portOpen = await tcpProbe(ip, port);
  if (!portOpen) {
    return res.status(200).json({ success: false, error: "Device unreachable." });
  }

  const zk = new ZKLib(ip, port, 5000, 0);
  try {
    await zk.createSocket();
    const info = await zk.getInfo();
    await zk.disconnect();
    return res.status(200).json({
      success: true,
      device_name: info?.deviceName || "ZKTeco Device",
      serial_number: info?.serialNumber || "N/A",
    });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};

export default async function handler(req, res) {
  if (!setupCors(req, res)) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }

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

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const action = getAction(req);

    switch (action) {
      case "settings":
      case "id-settings":
        return handleSettings(req, res, user, adminClient);
      case "unmatched":
        return handleUnmatched(req, res, user, adminClient);
      case "unmapped-ids":
        return handleUnmappedIds(req, res, user, adminClient);
      case "map-member":
        return handleMapMember(req, res, user, adminClient);
      case "auto-map":
        return handleAutoMap(req, res, user, adminClient);
      case "sync":
      case "sync-now":
        return handleSync(req, res, user, adminClient);
      case "enroll":
      case "unenroll":
        return handleEnroll(req, res, user, adminClient);
      case "test-connection":
        return handleTestConnection(req, res, user, adminClient);
      default:
        return res.status(400).json({ error: `Invalid scanner action: ${action}` });
    }
  } catch (error) {
    console.error("[scanner] Internal error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
}
