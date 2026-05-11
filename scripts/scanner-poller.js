#!/usr/bin/env node
/**
 * scripts/scanner-poller.js — Standalone background polling service
 *
 * Run with:  node scripts/scanner-poller.js
 *
 * Uses node-cron to tick every minute. On each tick, checks which
 * scanners are due (last_synced_at + sync_interval_minutes <= now)
 * and runs the full 7-step poll pipeline for each.
 *
 * Environment variables are loaded from .env.local (project root).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../api/_env.js";
import { runPollCycle } from "../api/_pollCore.js";

// node-cron is CommonJS
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const cron = require("node-cron");

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
const supabaseUrl    = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "[poller] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
    "         Copy .env.local to the project root or set these variables in your environment."
  );
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

console.log("═══════════════════════════════════════════════════");
console.log("  Hamming Scanner Polling Service");
console.log(`  Supabase: ${supabaseUrl}`);
console.log(`  Started:  ${new Date().toISOString()}`);
console.log("  Ticking every minute — scanners polled when due.");
console.log("═══════════════════════════════════════════════════\n");

// ─────────────────────────────────────────────────────────────────────────────
// Guard: prevent concurrent runs if a previous tick is still executing
// ─────────────────────────────────────────────────────────────────────────────
let running = false;

async function tick() {
  if (running) {
    console.log("[poller] Previous cycle still running — skipping tick.");
    return;
  }
  running = true;
  try {
    await runPollCycle(adminClient);
  } catch (err) {
    console.error("[poller] Cycle error:", err);
  } finally {
    running = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule: tick every minute, filter inside runPollCycle by sync_interval
// ─────────────────────────────────────────────────────────────────────────────
cron.schedule("* * * * *", tick);

// Run immediately on startup so you don't wait 1 minute for first data
tick();

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\n[poller] Received ${signal}. Shutting down gracefully…`);
  process.exit(0);
};

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException",  (err) => console.error("[poller] Uncaught exception:", err));
process.on("unhandledRejection", (err) => console.error("[poller] Unhandled rejection:", err));
