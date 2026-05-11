import net from "node:net";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";

// node-zklib ships as CommonJS — use createRequire to import it from ESM.
const require = createRequire(import.meta.url);
const ZKLib = require("node-zklib");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Low-level TCP probe — just checks that the port is open.
 * Returns true if the connection was established within `timeoutMs`.
 * Never throws.
 */
const tcpProbe = (ip, port, timeoutMs = 5000) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, ip);
  });

/**
 * ZKTeco-specific handshake via node-zklib.
 * Returns { device_name, serial_number } on success.
 * Throws a clean Error on failure.
 */
const zkHandshake = async (ip, port, timeoutMs = 5000) => {
  // node-zklib constructor: (ip, port, timeout_ms, inport)
  // inport = 0 lets the OS pick a free local port.
  const zk = new ZKLib(ip, port, timeoutMs, 0);

  try {
    await zk.createSocket();
  } catch (err) {
    // Normalise common socket errors into user-friendly messages.
    const msg = String(err?.message || err || "");
    if (/ECONNREFUSED/i.test(msg)) throw new Error("Connection refused — check the IP and port.");
    if (/ETIMEDOUT|timed out|timeout/i.test(msg)) throw new Error("Device unreachable — connection timed out.");
    if (/ECONNRESET/i.test(msg)) throw new Error("Connection reset by the device.");
    if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) throw new Error("Host unreachable — device is not on this network.");
    throw new Error(`Could not connect: ${msg || "Unknown socket error"}`);
  }

  let info;
  try {
    info = await zk.getInfo();
  } catch (err) {
    const msg = String(err?.message || err || "");
    // Connected but wrong device / auth issue
    if (/auth|password|invalid/i.test(msg)) throw new Error("Authentication failed — wrong device credentials.");
    throw new Error(`Handshake failed: ${msg || "Device did not respond to info request"}`);
  } finally {
    // Always release the socket — ignore disconnect errors.
    try { await zk.disconnect(); } catch { /* noop */ }
  }

  return {
    device_name: info?.deviceName ?? info?.device_name ?? "ZKTeco Device",
    serial_number: info?.serialNumber ?? info?.serial_number ?? "N/A",
    firmware_version: info?.firmwareVersion ?? info?.firmware_version ?? undefined,
    user_count: info?.userCounts ?? info?.user_count ?? undefined,
    log_count: info?.logCounts ?? info?.log_count ?? undefined,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS pre-flight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ success: false, error: "Server configuration error." });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "Missing Authorization bearer token." });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // ── Input validation ──────────────────────────────────────────────────
    const body = parseBody(req);
    const ip = String(body?.ip ?? "").trim();
    const port = Number(body?.port ?? 4370);
    const brand = String(body?.brand ?? "zkteco").toLowerCase().trim();

    if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      return res.status(400).json({ success: false, error: "Invalid IP address format." });
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return res.status(400).json({ success: false, error: "Port must be between 1 and 65535." });
    }

    if (brand !== "zkteco") {
      return res.status(400).json({ success: false, error: `Unsupported brand: ${brand}. Only 'zkteco' is supported.` });
    }

    // ── Layer 1: Raw TCP probe ─────────────────────────────────────────────
    // Fast check before we attempt the full ZK handshake.
    const portOpen = await tcpProbe(ip, port, 5000);
    if (!portOpen) {
      return res.status(200).json({
        success: false,
        error: `Device unreachable — no response at ${ip}:${port}. Check that the device is powered on and the port is correct.`,
      });
    }

    // ── Layer 2: ZKTeco handshake ──────────────────────────────────────────
    let deviceInfo;
    try {
      deviceInfo = await zkHandshake(ip, port, 5000);
    } catch (zkErr) {
      return res.status(200).json({
        success: false,
        error: zkErr.message ?? "ZKTeco handshake failed.",
      });
    }

    return res.status(200).json({
      success: true,
      device_name: deviceInfo.device_name,
      serial_number: deviceInfo.serial_number,
      firmware_version: deviceInfo.firmware_version,
      user_count: deviceInfo.user_count,
      log_count: deviceInfo.log_count,
    });

  } catch (err) {
    // Top-level safety net — never let an unhandled error crash the function.
    console.error("[scanner-test-connection] Unhandled error:", err);
    return res.status(500).json({
      success: false,
      error: "An unexpected server error occurred. Please try again.",
    });
  }
}
