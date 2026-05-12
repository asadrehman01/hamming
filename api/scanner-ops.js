
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";
import { pollSingleScanner } from "./_pollCore.js";
import net from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ZKLib = require("node-zklib");

/**
 * api/scanner-ops.js
 * Consolidated handler for scanner operational actions.
 * Handles: sync, enroll, test-connection
 */

const setupCors = (req, res, methods = "POST, DELETE, OPTIONS") => {
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
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
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
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Missing auth token." });

    const userClient  = createClient(supabaseUrl, supabaseAnonKey);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    const type = req.query?.type || "sync";

    switch (type) {
      case "sync":
        return await handleSync(req, res, user, adminClient);
      case "enroll":
        return await handleEnroll(req, res, user, adminClient);
      case "test-connection":
        return await handleTestConnection(req, res, user, adminClient);
      default:
        return res.status(400).json({ error: `Invalid scanner operation type: ${type}` });
    }
  } catch (err) {
    console.error("[scanner-ops] Internal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleSync(req, res, user, adminClient) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { data: scannerRow } = await adminClient.from("scanner_settings").select("*").eq("user_id", user.id).maybeSingle();
  const body = parseBody(req);
  const overrideIp   = String(body?.ip_address ?? "").trim();
  const overridePort = body?.port ? Number(body.port) : null;

  const effectiveScanner = {
    ...(scannerRow ?? {}),
    user_id: user.id,
    ip_address: overrideIp || scannerRow?.ip_address || "",
    port: overridePort ?? scannerRow?.port ?? 4370,
    enabled: true,
  };

  if (!effectiveScanner.ip_address) return res.status(400).json({ error: "No scanner IP configured." });
  const result = await pollSingleScanner(adminClient, effectiveScanner);
  return res.status(200).json({ success: result.error === null, ...result, synced_at: result.error ? undefined : new Date().toISOString() });
}

async function handleEnroll(req, res, user, adminClient) {
  const body = parseBody(req);
  const deviceUserId = String(body?.device_user_id ?? "").trim();

  if (req.method === "DELETE") {
    if (!deviceUserId) return res.status(400).json({ error: "device_user_id is required." });
    await adminClient.from("scanner_member_map").delete().eq("user_id", user.id).eq("device_user_id", deviceUserId);
    await adminClient.from("attendance_logs").update({ customer_id: null, matched: false, status: "unknown" }).eq("user_id", user.id).eq("device_user_id", deviceUserId);
    await adminClient.from("unmatched_scans").update({ reviewed: false }).eq("user_id", user.id).eq("device_user_id", deviceUserId);
    return res.status(200).json({ success: true });
  }

  if (req.method === "POST") {
    const customerId = String(body?.customer_id ?? "").trim();
    if (!deviceUserId || !customerId) return res.status(400).json({ error: "device_user_id and customer_id are required." });

    await adminClient.from("scanner_member_map").upsert({ user_id: user.id, device_user_id: deviceUserId, customer_id: customerId }, { onConflict: "user_id,device_user_id" });
    const { data: customer } = await adminClient.from("customers").select("membership_end_date").eq("id", customerId).maybeSingle();
    const membershipEnd = customer?.membership_end_date ?? null;

    const { data: logs } = await adminClient.from("attendance_logs").select("id, scanned_at").eq("user_id", user.id).eq("device_user_id", deviceUserId);
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
      for (let i = 0; i < updates.length; i += 100) {
        const { data: updated } = await adminClient.from("attendance_logs").upsert(updates.slice(i, i + 100)).select("id");
        backfilled += (updated ?? []).length;
      }
    }
    await adminClient.from("unmatched_scans").update({ reviewed: true }).eq("user_id", user.id).eq("device_user_id", deviceUserId);
    return res.status(200).json({ success: true, backfilled });
  }
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleTestConnection(req, res, user, adminClient) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = parseBody(req);
  const ip = String(body?.ip || body?.ip_address || "").trim();
  const port = Number(body?.port ?? 4370);

  if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return res.status(400).json({ error: "Invalid IP address format." });

  const tcpProbe = (ip, port) => new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, ip);
  });

  const portOpen = await tcpProbe(ip, port);
  if (!portOpen) return res.status(200).json({ success: false, error: "Device unreachable." });

  const zk = new ZKLib(ip, port, 5000, 0);
  try {
    await zk.createSocket();
    const info = await zk.getInfo();
    await zk.disconnect();
    return res.status(200).json({ success: true, device_name: info?.deviceName || "ZKTeco Device", serial_number: info?.serialNumber || "N/A" });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
