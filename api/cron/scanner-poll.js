/**
 * api/cron/scanner-poll.js — Vercel Cron Job endpoint
 *
 * Called by Vercel on the schedule in vercel.json.
 * Secured by CRON_SECRET env variable.
 *
 * Iterates all enabled scanner_settings records across all gyms,
 * runs the full 7-step poll pipeline for each one that is due.
 */
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";
import { runPollCycle } from "../_pollCore.js";

export default async function handler(req, res) {
  // Only GET is sent by Vercel cron; block everything else
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Auth: validate CRON_SECRET ──────────────────────────────────────────────
  // Vercel automatically injects Authorization: Bearer <CRON_SECRET>
  const cronSecret = getEnv("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers?.authorization || "";
    const provided = authHeader.replace(/^bearer\s+/i, "").trim();
    if (provided !== cronSecret) {
      console.warn("[cron/scanner-poll] Unauthorized request — bad CRON_SECRET");
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const supabaseUrl    = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: "Server configuration error — missing Supabase credentials." });
    }

    // Service-role client bypasses RLS — can read all gyms' scanner settings
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const startedAt = Date.now();
    const outcome   = await runPollCycle(adminClient);
    const durationMs = Date.now() - startedAt;

    return res.status(200).json({
      ok: true,
      duration_ms: durationMs,
      scanners_processed: outcome.results?.length ?? 0,
      results: outcome.results ?? [],
    });
  } catch (err) {
    console.error("[cron/scanner-poll] Unhandled error:", err);
    return res.status(500).json({ error: err.message ?? "Unexpected server error" });
  }
}
