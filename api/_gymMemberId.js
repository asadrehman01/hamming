/**
 * api/_gymMemberId.js — Gym Member ID generation service
 *
 * Exported:
 *   generateGymMemberId(userId, adminClient) → Promise<string>
 *   previewGymMemberId(userId, adminClient)  → Promise<string>  (read-only, no increment)
 *
 * The heavy lifting (locking, incrementing) lives in the Postgres function
 * `generate_gym_member_id` (migration 015) which runs inside a single
 * transaction with SELECT ... FOR UPDATE, making it safe under concurrency.
 *
 * Do NOT call this function from client-side code — it requires the
 * service-role adminClient to bypass RLS on gym_settings.
 */

/**
 * Generate and reserve the next gym member ID for a given gym owner.
 *
 * Steps (all inside one Postgres transaction):
 *  1. Read gym_settings (or use defaults if none exist).
 *  2. Combine id_format + lpad(id_counter, id_padding) → the ID string.
 *  3. Increment id_counter in gym_settings.
 *  4. Return the ID.
 *
 * @param {string} userId      — the gym owner's auth.users UUID
 * @param {object} adminClient — Supabase client with service-role key
 * @returns {Promise<string>}  — e.g. "MEM-007", "GYM-0012", "003"
 */
export async function generateGymMemberId(userId, adminClient) {
  if (!userId)      throw new Error("generateGymMemberId: userId is required.");
  if (!adminClient) throw new Error("generateGymMemberId: adminClient is required.");

  const { data, error } = await adminClient.rpc("generate_gym_member_id", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Member ID generation failed: ${error.message}`);
  }

  if (typeof data !== "string" || !data) {
    throw new Error("Member ID generation returned an unexpected value.");
  }

  return data;
}

/**
 * Preview what the NEXT member ID would look like without reserving it.
 * Reads gym_settings and formats the ID client-side — no DB write.
 * Useful for showing a preview in the UI before the member is saved.
 *
 * @param {string} userId      — the gym owner's auth.users UUID
 * @param {object} adminClient — Supabase client (service-role or anon+RLS)
 * @returns {Promise<string>}  — e.g. "MEM-007"
 */
export async function previewGymMemberId(userId, adminClient) {
  if (!userId)      throw new Error("previewGymMemberId: userId is required.");
  if (!adminClient) throw new Error("previewGymMemberId: adminClient is required.");

  const { data, error } = await adminClient
    .from("gym_settings")
    .select("id_format, id_counter, id_padding")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read gym settings: ${error.message}`);

  // Fall back to defaults if no settings row exists yet
  const format  = data?.id_format  ?? "";
  const counter = data?.id_counter ?? 1;
  const padding = data?.id_padding ?? 3;

  return formatMemberId(format, counter, padding);
}

/**
 * Pure helper — combine a prefix, counter, and padding into an ID string.
 * Mirrors the lpad() logic in the Postgres function exactly.
 *
 * @param {string} format   — prefix, e.g. "MEM-" or ""
 * @param {number} counter  — the integer to format
 * @param {number} padding  — minimum digit width (zero-padded)
 * @returns {string}
 *
 * Examples:
 *   formatMemberId("MEM-", 7, 3)  → "MEM-007"
 *   formatMemberId("",    12, 4)  → "0012"
 *   formatMemberId("GYM-", 1000, 3) → "GYM-1000"  (no truncation)
 */
export function formatMemberId(format, counter, padding) {
  const n = String(Math.max(1, Math.floor(counter)));
  const padded = n.length >= padding ? n : n.padStart(padding, "0");
  return String(format ?? "") + padded;
}
