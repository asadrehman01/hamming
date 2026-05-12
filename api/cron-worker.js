
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";
import { runPollCycle } from "./_pollCore.js";

/**
 * api/cron-worker.js
 * Consolidated handler for all cron jobs.
 * Handles: scanner-poll, expiry-reminders
 */

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth: validate CRON_SECRET
  const cronSecret = getEnv("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers?.authorization || "";
    const provided = authHeader.replace(/^bearer\s+/i, "").trim();
    if (provided !== cronSecret) {
      console.warn("[cron-worker] Unauthorized request — bad CRON_SECRET");
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const supabaseUrl     = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const serviceRoleKey  = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: "Missing required environment variables." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const job = req.query?.job || "scanner-poll";

    switch (job) {
      case "scanner-poll":
        return await handleScannerPoll(req, res, admin);
      case "expiry-reminders":
        return await handleExpiryReminders(req, res, admin);
      default:
        return res.status(400).json({ error: `Invalid job type: ${job}` });
    }
  } catch (err) {
    console.error("[cron-worker] Internal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleScannerPoll(req, res, admin) {
  const startedAt = Date.now();
  const outcome = await runPollCycle(admin);
  const durationMs = Date.now() - startedAt;
  return res.status(200).json({ ok: true, duration_ms: durationMs, scanners_processed: outcome.results?.length ?? 0, results: outcome.results ?? [] });
}

async function handleExpiryReminders(req, res, admin) {
  const resendApiKey = getEnv("RESEND_API_KEY");
  const resendFromEmail = getEnv("RESEND_FROM_EMAIL");

  if (!resendApiKey || !resendFromEmail) return res.status(500).json({ error: "Missing Resend configuration." });

  const targetDate = new Date();
  targetDate.setUTCDate(targetDate.getUTCDate() + 3);
  const targetDateStr = targetDate.toISOString().split("T")[0];

  const { data: customers, error: customerError } = await admin.from("customers").select("id, gym_id, first_name, email").eq("membership_end_date", targetDateStr).not("email", "is", null);
  if (customerError) throw customerError;
  if (!customers?.length) return res.status(200).json({ success: true, count: 0, message: "No members expiring in 3 days." });

  const gymIds = [...new Set(customers.map((c) => c.gym_id))];
  const [templatesRes, integrationsRes] = await Promise.all([
    admin.from("automation_templates").select("*").in("gym_id", gymIds).eq("name", "EXPIRY_REMINDER"),
    admin.from("gym_integrations").select("*").in("gym_id", gymIds).eq("provider", "RESEND"),
  ]);

  if (templatesRes.error) throw templatesRes.error;
  if (integrationsRes.error) throw integrationsRes.error;

  const templateMap = new Map(templatesRes.data.map((t) => [t.gym_id, t]));
  const integrationMap = new Map(integrationsRes.data.map((i) => [i.gym_id, i]));

  const replaceTokens = ({ text, firstName, reviewLink }) => {
    return text.replace(/\{first_name\}/g, firstName || "Member").replace(/\{review_link\}/g, reviewLink || "");
  };

  const sendWithResend = async ({ apiKey, from, to, subject, text, replyTo }) => {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, reply_to: replyTo }),
    });
    if (!r.ok) throw new Error(`Resend error: ${r.status} ${await r.text()}`);
    return r.json();
  };

  let sentCount = 0;
  for (const customer of customers) {
    const template = templateMap.get(customer.gym_id);
    const integration = integrationMap.get(customer.gym_id);
    if (!template) continue;

    try {
      const { data: existing } = await admin.from("communication_logs").select("id").eq("customer_id", customer.id).eq("template_name", "EXPIRY_REMINDER").gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (existing?.length > 0) continue;
    } catch (_) {}

    try {
      const subject = replaceTokens({ text: template.subject, firstName: customer.first_name, reviewLink: integration?.google_business_link });
      const body = replaceTokens({ text: template.body_text, firstName: customer.first_name, reviewLink: integration?.google_business_link });
      const from = integration?.sender_profile ? `${integration.sender_profile} <${resendFromEmail}>` : resendFromEmail;

      await sendWithResend({ apiKey: resendApiKey, from, to: customer.email, subject, text: body, replyTo: integration?.reply_to_email || undefined });
      try { await admin.from("communication_logs").insert({ gym_id: customer.gym_id, customer_id: customer.id, template_name: "EXPIRY_REMINDER", recipient_email: customer.email, subject, status: "sent" }); } catch (_) {}
      sentCount++;
    } catch (err) {
      console.error(`[expiry-reminders] Failed to send to ${customer.id}:`, err.message);
      try { await admin.from("communication_logs").insert({ gym_id: customer.gym_id, customer_id: customer.id, template_name: "EXPIRY_REMINDER", recipient_email: customer.email, subject: template.subject, status: "failed", error_message: err.message }); } catch (_) {}
    }
  }

  return res.status(200).json({ success: true, sentCount });
}
