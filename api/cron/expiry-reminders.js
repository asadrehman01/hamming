/**
 * api/cron/expiry-reminders.js
 * 
 * Automated nightly job to send expiry reminders to members.
 * Runs at 00:01 AM (configured in vercel.json).
 * 
 * Logic:
 * 1. Find all customers whose membership expires in exactly 3 days.
 * 2. For each customer:
 *    a. Fetch their gym's EXPIRY_REMINDER template.
 *    b. Fetch their gym's Resend integration settings.
 *    c. Check communication_logs to ensure a reminder wasn't already sent today.
 *    d. Send the email and log the outcome.
 */

import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../_env.js";

const getBearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== "string") return "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
};

const replaceTokens = ({ text, firstName, reviewLink }) =>
  String(text || "")
    .replace(/\{first_name\}/gi, firstName || "there")
    .replace(/\{review_link\}/gi, reviewLink || "");

const sendWithResend = async ({ apiKey, from, to, subject, text, replyTo }) => {
  const payload = {
    from,
    to: [to],
    subject,
    text,
  };

  if (replyTo) {
    payload.reply_to = replyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const textBody = await response.text();
    throw new Error(`Resend error ${response.status}: ${textBody || response.statusText}`);
  }

  return response.json();
};

export default async function handler(req, res) {
  // Only allow GET (Vercel Cron) or POST (manual trigger)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Auth: validate CRON_SECRET
  const cronSecret = getEnv("CRON_SECRET");
  if (cronSecret) {
    const token = getBearerToken(req);
    if (token !== cronSecret) {
      console.warn("[cron/expiry-reminders] Unauthorized request — bad CRON_SECRET");
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = getEnv("RESEND_API_KEY");
    const resendFromEmail = getEnv("RESEND_FROM_EMAIL");

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !resendFromEmail) {
      return res.status(500).json({ error: "Missing required environment variables." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 2. Calculate target date (today + 3 days)
    // We use UTC date to match the DATE type in Postgres
    const targetDate = new Date();
    targetDate.setUTCDate(targetDate.getUTCDate() + 3);
    const targetDateStr = targetDate.toISOString().split("T")[0];

    console.log(`[cron/expiry-reminders] Scanning for members expiring on ${targetDateStr}`);

    // 3. Find customers expiring on targetDate
    const { data: customers, error: customerError } = await admin
      .from("customers")
      .select("id, gym_id, first_name, email, membership_end_date")
      .eq("membership_end_date", targetDateStr)
      .not("email", "is", null);

    if (customerError) throw customerError;

    if (!customers?.length) {
      return res.status(200).json({ success: true, count: 0, message: "No members expiring in 3 days." });
    }

    console.log(`[cron/expiry-reminders] Found ${customers.length} candidate(s).`);

    // 4. Batch fetch gym settings and templates to avoid N+1 queries
    const gymIds = [...new Set(customers.map((c) => c.gym_id))];
    
    const [templatesRes, integrationsRes] = await Promise.all([
      admin.from("automation_templates").select("*").in("gym_id", gymIds).eq("name", "EXPIRY_REMINDER"),
      admin.from("gym_integrations").select("*").in("gym_id", gymIds).eq("provider", "RESEND"),
    ]);

    if (templatesRes.error) throw templatesRes.error;
    if (integrationsRes.error) throw integrationsRes.error;

    const templateMap = new Map(templatesRes.data.map((t) => [t.gym_id, t]));
    const integrationMap = new Map(integrationsRes.data.map((i) => [i.gym_id, i]));

    let sentCount = 0;
    let failedCount = 0;
    const results = [];

    // 5. Process each customer
    for (const customer of customers) {
      const template = templateMap.get(customer.gym_id);
      const integration = integrationMap.get(customer.gym_id);

      if (!template) {
        console.warn(`[cron/expiry-reminders] No EXPIRY_REMINDER template found for gym ${customer.gym_id}`);
        continue;
      }

      // Check if already sent in the last 24h to prevent duplicates (optional if table exists)
      try {
        const { data: existingLogs } = await admin
          .from("communication_logs")
          .select("id")
          .eq("customer_id", customer.id)
          .eq("template_name", "EXPIRY_REMINDER")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (existingLogs?.length > 0) {
          console.log(`[cron/expiry-reminders] Skipping customer ${customer.id} — reminder already sent recently.`);
          continue;
        }
      } catch (logTableError) {
        // Table probably doesn't exist, ignore and proceed
        console.warn("[cron/expiry-reminders] communication_logs table missing or unreachable. Skipping duplicate check.");
      }

      try {
        const personalizedSubject = replaceTokens({
          text: template.subject,
          firstName: customer.first_name,
          reviewLink: integration?.google_business_link,
        });

        const personalizedBody = replaceTokens({
          text: template.body_text,
          firstName: customer.first_name,
          reviewLink: integration?.google_business_link,
        });

        const fromField = integration?.sender_profile
          ? `${integration.sender_profile} <${resendFromEmail}>`
          : resendFromEmail;

        await sendWithResend({
          apiKey: resendApiKey,
          from: fromField,
          to: customer.email,
          subject: personalizedSubject,
          text: personalizedBody,
          replyTo: integration?.reply_to_email || undefined,
        });

        // Log success (optional)
        try {
          await admin.from("communication_logs").insert({
            gym_id: customer.gym_id,
            customer_id: customer.id,
            template_name: "EXPIRY_REMINDER",
            recipient_email: customer.email,
            subject: personalizedSubject,
            status: "sent",
          });
        } catch (logInsertError) {
          // Ignore log errors
        }

        sentCount++;
        results.push({ customerId: customer.id, status: "sent" });
      } catch (err) {
        console.error(`[cron/expiry-reminders] Failed to send to ${customer.id}:`, err.message);
        
        // Log failure (optional)
        try {
          await admin.from("communication_logs").insert({
            gym_id: customer.gym_id,
            customer_id: customer.id,
            template_name: "EXPIRY_REMINDER",
            recipient_email: customer.email,
            subject: template.subject, // Use raw subject as fallback
            status: "failed",
            error_message: err.message,
          });
        } catch (logInsertError) {
          // Ignore log errors
        }

        failedCount++;
        results.push({ customerId: customer.id, status: "failed", error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      sentCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error("[cron/expiry-reminders] Fatal error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
}
