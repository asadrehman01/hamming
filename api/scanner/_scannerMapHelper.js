/**
 * api/scanner/_scannerMapHelper.js
 * Shared logic used by map-member and auto-map endpoints.
 */

/**
 * Creates a mapping, updates customers.scanner_id, retroactively logs attendance,
 * and marks unmatched_scans as reviewed.
 *
 * @param {object} adminClient  — Supabase admin client
 * @param {string} userId       — gym owner's auth.users UUID
 * @param {string} deviceUserId — device_user_id string (e.g. "007")
 * @param {string} customerId   — customers UUID
 * @returns {{ logged: number }}
 */
export async function applyMemberMapping(adminClient, userId, deviceUserId, customerId) {
  // 1. Upsert scanner_member_map
  const { error: mapErr } = await adminClient.from("scanner_member_map").upsert(
    { user_id: userId, device_user_id: deviceUserId, customer_id: customerId },
    { onConflict: "user_id,device_user_id" }
  );
  if (mapErr) throw new Error(`scanner_member_map upsert failed: ${mapErr.message}`);

  // 2. Update customer's scanner_id to the numeric device UID
  const numericId = parseInt(deviceUserId, 10);
  if (!isNaN(numericId)) {
    await adminClient.from("customers")
      .update({ scanner_id: numericId })
      .eq("id", customerId);
  }

  // 3. Load customer's membership_end_date for status calculation
  const { data: customer } = await adminClient
    .from("customers")
    .select("membership_end_date")
    .eq("id", customerId)
    .maybeSingle();

  const membershipEnd = customer?.membership_end_date
    ? (() => { const d = new Date(customer.membership_end_date); d.setHours(23, 59, 59, 999); return d; })()
    : null;

  // 4. Load all unreviewed unmatched_scans for this device UID
  const { data: scans, error: scansErr } = await adminClient
    .from("unmatched_scans")
    .select("device_user_id, scanned_at, punch_type")
    .eq("user_id", userId)
    .eq("device_user_id", deviceUserId)
    .eq("reviewed", false);

  if (scansErr) throw new Error(`unmatched_scans load failed: ${scansErr.message}`);

  // 5. Build attendance_logs rows with correct status per scan timestamp
  const logsToUpsert = (scans ?? []).map((scan) => {
    const status = membershipEnd && new Date(scan.scanned_at) > membershipEnd
      ? "expired_member"
      : "active";
    return {
      user_id:       userId,
      customer_id:   customerId,
      device_user_id: deviceUserId,
      scanned_at:    scan.scanned_at,
      punch_type:    scan.punch_type ?? "check_in",
      matched:       true,
      status,
      synced_at:     new Date().toISOString(),
    };
  });

  let logged = 0;
  if (logsToUpsert.length > 0) {
    // Chunk to avoid payload limits
    for (let i = 0; i < logsToUpsert.length; i += 100) {
      const { data: upserted } = await adminClient
        .from("attendance_logs")
        .upsert(logsToUpsert.slice(i, i + 100), {
          onConflict: "user_id,device_user_id,scanned_at",
          ignoreDuplicates: false, // update existing unmatched rows
        })
        .select("id");
      logged += (upserted ?? []).length;
    }
  }

  // 6. Mark unmatched_scans as reviewed
  await adminClient.from("unmatched_scans")
    .update({ reviewed: true })
    .eq("user_id", userId)
    .eq("device_user_id", deviceUserId);

  return { logged };
}

/**
 * Extracts the numeric portion from a gym_member_id string.
 * "MEM-007" → 7, "GYM-0042" → 42, "003" → 3, "7" → 7
 * Returns null if no numeric portion found.
 */
export function extractNumericFromMemberId(gymMemberId) {
  if (!gymMemberId) return null;
  const match = String(gymMemberId).match(/(\d+)\s*$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return isNaN(n) ? null : n;
}
