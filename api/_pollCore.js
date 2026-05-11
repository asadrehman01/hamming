/**
 * _pollCore.js — Shared biometric scanner polling logic.
 *
 * Exported:
 *   runPollCycle(adminClient)           — iterate all enabled scanners
 *   pollSingleScanner(adminClient, row) — poll one scanner row
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ZKLib = require("node-zklib");

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const FAILURE_NOTIFY_THRESHOLD = 5;
const CONNECT_TIMEOUT_MS = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/** ZKTeco state → our punch_type enum */
const stateToType = (state) => {
  const n = Number(state);
  if (n === 0 || n === 3 || n === 4) return "check_in";
  if (n === 1 || n === 2 || n === 5) return "check_out";
  return "unknown";
};

/** membership_end_date (date string) vs scan timestamp → status */
const resolveStatus = (membershipEnd, scanTs) => {
  if (!membershipEnd) return "active";
  const endDate = new Date(membershipEnd);
  endDate.setHours(23, 59, 59, 999);
  return new Date(scanTs) > endDate ? "expired_member" : "active";
};

/** Is this scanner due for a poll based on last_synced_at + interval? */
const isDue = (scanner) => {
  if (!scanner.last_synced_at) return true;
  const nextDue = new Date(scanner.last_synced_at).getTime()
    + scanner.sync_interval_minutes * 60 * 1000;
  return Date.now() >= nextDue;
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 + 2: Connect to device and pull new attendance records
// ─────────────────────────────────────────────────────────────────────────────
async function connectAndFetch(ip, port, since) {
  const zk = new ZKLib(ip, port, CONNECT_TIMEOUT_MS, 0);

  // STEP 1 — Connect
  try {
    await zk.createSocket();
  } catch (err) {
    const msg = String(err?.message || "");
    if (/ECONNREFUSED/i.test(msg)) throw new Error(`Connection refused at ${ip}:${port} — verify IP and port.`);
    if (/ETIMEDOUT|timed out|timeout/i.test(msg)) throw new Error(`Connection timed out at ${ip}:${port} — device may be offline.`);
    if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) throw new Error(`Host unreachable: ${ip} — device is not on this network.`);
    throw new Error(`Cannot connect to ${ip}:${port} — ${msg || "Unknown socket error"}`);
  }

  // STEP 2 — Fetch
  let records;
  try {
    const result = await zk.getAttendances();
    records = Array.isArray(result) ? result : (result?.data ?? []);
  } catch (err) {
    throw new Error(`Failed to read attendance from device: ${err?.message ?? String(err)}`);
  } finally {
    try { await zk.disconnect(); } catch { /* noop */ }
  }

  // STEP 3 — Filter out records with invalid timestamps and optionally normalize
  records = records.filter((r) => {
    const t = new Date(r.timestamp);
    if (isNaN(t.getTime())) return false;
    r.timestamp = t; // Normalize to Date object for safe toISOString() later
    return true;
  });

  // STEP 4 — Filter to only records newer than `since` (client-side dedup layer 1)
  if (since) {
    const sinceTs = new Date(since).getTime();
    records = records.filter((r) => r.timestamp.getTime() > sinceTs);
  }

  return records;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle a connection failure — increment counter, notify if threshold hit
// ─────────────────────────────────────────────────────────────────────────────
async function handleFailure(adminClient, scanner, errorMsg, syncedAt) {
  const newCount = (scanner.failed_attempts ?? 0) + 1;

  const { error: updateError } = await adminClient
    .from("scanner_settings")
    .update({ failed_attempts: newCount, last_failed_at: syncedAt })
    .eq("id", scanner.id);

  if (updateError) {
    console.error(`[handleFailure] Failed to update scanner_settings for scanner ${scanner.id}:`, updateError.message, { syncedAt, errorMsg });
  }

  if (newCount >= FAILURE_NOTIFY_THRESHOLD) {
    const minutes = newCount * (scanner.sync_interval_minutes ?? 15);

    // Avoid duplicate notifications: only insert if no unread failure notification in last hour
    const { data: recent, error: selectError } = await adminClient
      .from("scanner_notifications")
      .select("id")
      .eq("user_id", scanner.user_id)
      .eq("type", "connection_failure")
      .eq("is_read", false)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .limit(1);

    if (selectError) {
      console.error(`[handleFailure] Failed to select scanner_notifications for user ${scanner.user_id}:`, selectError.message, { scannerId: scanner.id });
    }

    if (!recent?.length) {
      const { error: insertError } = await adminClient.from("scanner_notifications").insert({
        user_id: scanner.user_id,
        type: "connection_failure",
        title: "Scanner Unreachable",
        message: `Your scanner at ${scanner.ip_address} has been unreachable for ${minutes} minutes. Please check that the device is powered on and connected to the network.`,
        metadata: { ip: scanner.ip_address, port: scanner.port, failed_attempts: newCount, last_error: errorMsg },
      });

      if (insertError) {
        console.error(`[handleFailure] Failed to insert notification for user ${scanner.user_id}:`, insertError.message, { scannerId: scanner.id });
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: poll one scanner through all 7 steps
// ─────────────────────────────────────────────────────────────────────────────
export async function pollSingleScanner(adminClient, scanner) {
  const tag = `[poller][${scanner.ip_address}]`;
  const syncedAt = new Date().toISOString();

  const result = {
    scanner_id: scanner.id,
    ip: scanner.ip_address,
    inserted: 0, matched: 0, unmatched: 0, expired: 0, skipped: 0,
    error: null,
  };

  // ── Steps 1–3: Connect, fetch, pre-filter ──────────────────────────────────
  let rawRecords;
  try {
    rawRecords = await connectAndFetch(scanner.ip_address, scanner.port, scanner.last_synced_at);
    console.log(`${tag} Fetched ${rawRecords.length} record(s) since ${scanner.last_synced_at ?? "beginning"}`);

    // Reset failure counter on successful connection
    if (scanner.failed_attempts > 0) {
      await adminClient.from("scanner_settings")
        .update({ failed_attempts: 0, last_failed_at: null })
        .eq("id", scanner.id);
    }
  } catch (err) {
    result.error = err.message;
    console.error(`${tag} Connection failed:`, err.message);
    await handleFailure(adminClient, scanner, err.message, syncedAt);
    return result;
  }

  // Nothing new — just update timestamp and return
  if (rawRecords.length === 0) {
    await adminClient.from("scanner_settings")
      .update({ last_synced_at: syncedAt })
      .eq("id", scanner.id);
    return result;
  }

  // ── Step 4: Build member map (device_user_id → customer_id) ───────────────
  const { data: memberMaps, error: mapError } = await adminClient
    .from("scanner_member_map")
    .select("device_user_id, customer_id")
    .eq("user_id", scanner.user_id);

  if (mapError) {
    result.error = `Failed to load member map: ${mapError.message}`;
    console.error(`${tag} ${result.error}`);
    return result;
  }

  const memberMap = new Map((memberMaps ?? []).map((m) => [String(m.device_user_id), m.customer_id]));

  // Bulk-load subscription dates for all mapped customers
  const allCustomerIds = [...new Set(memberMap.values())].filter(Boolean);
  const customerSubMap = new Map();

  if (allCustomerIds.length > 0) {
    const { data: custs, error: custError } = await adminClient
      .from("customers")
      .select("id, membership_end_date")
      .in("id", allCustomerIds);

    if (custError) {
      result.error = `Failed to load customer data: ${custError.message}`;
      console.error(`${tag} ${result.error}`);
      return result;
    }

    for (const c of custs ?? []) {
      customerSubMap.set(c.id, c.membership_end_date ?? null);
    }
  }

  // ── Steps 4–6: Process each raw record ────────────────────────────────────
  const logsToUpsert    = [];
  const unmatchedToSave = [];

  for (const r of rawRecords) {
    const deviceUserId = String(r.uid ?? r.id ?? "").trim();
    if (!deviceUserId) continue;

    const punchTime = (r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)).toISOString();
    const punchType = stateToType(r.state);
    const rawPayload = { uid: r.uid, id: r.id, state: r.state, type: r.type };

    const customerId = memberMap.get(deviceUserId) ?? null;

    if (!customerId) {
      // ── Step 4 miss: put in unmatched_scans ─────────────────────────────
      result.unmatched++;
      unmatchedToSave.push({
        user_id: scanner.user_id,
        device_user_id: deviceUserId,
        scanned_at: punchTime,
        punch_type: punchType,
        raw_payload: rawPayload,
      });
      // Also log in attendance_logs so the UI can display all scans
      logsToUpsert.push({
        user_id: scanner.user_id,
        device_user_id: deviceUserId,
        customer_id: null,
        scanned_at: punchTime,
        punch_type: punchType,
        matched: false,
        status: "unknown",
        synced_at: syncedAt,
        raw_payload: rawPayload,
      });
      continue;
    }

    // ── Step 5: Subscription check ─────────────────────────────────────────
    const membershipEnd = customerSubMap.get(customerId) ?? null;
    const status = resolveStatus(membershipEnd, punchTime);
    if (status === "expired_member") result.expired++;

    // ── Step 6: Queue for attendance_logs insert ───────────────────────────
    result.matched++;
    logsToUpsert.push({
      user_id: scanner.user_id,
      device_user_id: deviceUserId,
      customer_id: customerId,
      scanned_at: punchTime,
      punch_type: punchType,
      matched: true,
      status,
      synced_at: syncedAt,
      raw_payload: rawPayload,
    });
  }

  // ── Bulk writes — DB-level dedup via unique index ──────────────────────────
  let writeFailed = false;

  if (logsToUpsert.length > 0) {
    const { data: upserted, error: upsertError } = await adminClient
      .from("attendance_logs")
      .upsert(logsToUpsert, { onConflict: "user_id,device_user_id,scanned_at", ignoreDuplicates: true })
      .select("id");

    if (upsertError) {
      console.error(`${tag} Failed to upsert attendance_logs:`, upsertError.message);
      result.error = `Upsert failed: ${upsertError.message}`;
      writeFailed = true;
    } else {
      result.inserted = (upserted ?? []).length;
      result.skipped  = logsToUpsert.length - result.inserted;
    }
  }

  if (!writeFailed && unmatchedToSave.length > 0) {
    const { error: unmatchedError } = await adminClient
      .from("unmatched_scans")
      .upsert(unmatchedToSave, { onConflict: "user_id,device_user_id,scanned_at", ignoreDuplicates: true });

    if (unmatchedError) {
      console.error(`${tag} Failed to upsert unmatched_scans:`, unmatchedError.message);
      result.error = `Unmatched upsert failed: ${unmatchedError.message}`;
      writeFailed = true;
    }
  }

  // ── Step 7: Update last_synced_at + reset failure counter ─────────────────
  if (!writeFailed) {
    const { error: syncError } = await adminClient.from("scanner_settings")
      .update({ last_synced_at: syncedAt, failed_attempts: 0 })
      .eq("id", scanner.id);

    if (syncError) {
      console.error(`${tag} Failed to update scanner_settings:`, syncError.message);
      // We don't return here because the data was already inserted
    }
  }

  console.log(`${tag} Done — inserted: ${result.inserted}, matched: ${result.matched}, unmatched: ${result.unmatched}, expired: ${result.expired}, skipped: ${result.skipped}`);
  return result;
}


// ─────────────────────────────────────────────────────────────────────────────
// Run one full poll cycle across ALL enabled scanners
// ─────────────────────────────────────────────────────────────────────────────
export async function runPollCycle(adminClient) {
  console.log(`[poller] Cycle start — ${new Date().toISOString()}`);

  const { data: scanners, error } = await adminClient
    .from("scanner_settings")
    .select("*")
    .eq("enabled", true);

  if (error) {
    console.error("[poller] Failed to load scanner settings:", error.message);
    return { error: error.message, results: [] };
  }

  if (!scanners?.length) {
    console.log("[poller] No enabled scanners.");
    return { results: [] };
  }

  const due = scanners.filter(isDue);
  console.log(`[poller] ${scanners.length} enabled, ${due.length} due for sync.`);

  const results = [];
  for (const scanner of due) {
    try {
      const r = await pollSingleScanner(adminClient, scanner);
      results.push(r);
    } catch (err) {
      console.error(`[poller] Unexpected error for ${scanner.ip_address}:`, err);
      results.push({ scanner_id: scanner.id, ip: scanner.ip_address, error: String(err.message) });
    }
  }

  console.log(`[poller] Cycle complete — ${results.length} scanner(s) processed.`);
  return { results };
}
