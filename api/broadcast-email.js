import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_env.js";

const getBearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== "string") return "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
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

const replaceTokens = ({ text, firstName, reviewLink }) =>
  String(text || "")
    .replace(/\{first_name\}/gi, firstName || "there")
    .replace(/\{review_link\}/gi, reviewLink || "");

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const maskEmail = (value) => {
  const email = String(value || "").trim();
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "[redacted]";
  return `${localPart.slice(0, 2)}***@${domain}`;
};

const isActiveMember = (membershipEndDate) => {
  if (!membershipEndDate) return true;
  const end = new Date(membershipEndDate);
  if (Number.isNaN(end.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return end >= now;
};

const sendWithResend = async ({ apiKey, from, to, subject, text, html, replyTo }) => {
  const normalizedText = String(text || "").trim();
  const normalizedHtml = String(html || "").trim();

  if (!normalizedText && !normalizedHtml) {
    throw new Error("Email payload must include text or html content.");
  }

  const payload = {
    from,
    to: [to],
    subject,
  };

  if (normalizedText) {
    payload.text = normalizedText;
  }

  if (normalizedHtml) {
    payload.html = normalizedHtml;
  }

  if (replyTo) {
    payload.reply_to = replyTo;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const textBody = await response.text();
    throw new Error(`Resend error ${response.status}: ${textBody || response.statusText}`);
  }

  return response.json().catch(() => ({}));
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = getEnv("RESEND_API_KEY");
    const resendFromEmail = getEnv("RESEND_FROM_EMAIL");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return res.status(500).json({ error: "Missing Supabase server environment variables." });
    }

    if (!resendApiKey || !resendFromEmail) {
      return res.status(500).json({ error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL." });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing Authorization bearer token." });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);

    if (authError || !user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = parseBody(req);

    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();
    const htmlMessage =
      typeof body?.htmlMessage === "string" ? body.htmlMessage.trim() : "";
    const recipientGroup = String(body?.recipientGroup || "ALL").toUpperCase();
    const recipientEmail = String(body?.recipientEmail || "").trim();

    if (!subject || (!message && !htmlMessage)) {
      return res
        .status(400)
        .json({ error: "subject and at least one of message/htmlMessage are required." });
    }

    const { data: integration } = await admin
      .from("gym_integrations")
      .select("reply_to_email, sender_profile, google_business_link")
      .eq("gym_id", user.id)
      .eq("provider", "RESEND")
      .maybeSingle();

    let recipients = [];

    if (recipientGroup === "INDIVIDUAL") {
      if (!recipientEmail || !isValidEmail(recipientEmail)) {
        return res.status(400).json({ error: "recipientEmail is required for INDIVIDUAL recipientGroup." });
      }

      recipients = [
        {
          email: recipientEmail,
          first_name: recipientEmail.split("@")[0] || "there",
          membership_end_date: null,
        },
      ];
    } else {
      const { data: customers, error: customerError } = await admin
        .from("customers")
        .select("email, first_name, membership_end_date")
        .eq("gym_id", user.id)
        .not("email", "is", null);

      if (customerError) {
        throw customerError;
      }

      const baseRecipients = Array.from(
        new Map((customers || []).filter((row) => row.email).map((row) => [row.email.toLowerCase(), row])).values(),
      );

      if (recipientGroup === "ACTIVE") {
        recipients = baseRecipients.filter((row) => isActiveMember(row.membership_end_date));
      } else if (recipientGroup === "EXPIRED") {
        recipients = baseRecipients.filter((row) => !isActiveMember(row.membership_end_date));
      } else {
        // ALL and UNREVIEWED both fall back to all known recipients.
        recipients = baseRecipients;
      }
    }

    if (recipients.length === 0) {
      return res.status(200).json({ success: true, count: 0, message: "No recipients found." });
    }

    let sent = 0;
    const failures = [];

    for (const recipient of recipients) {
      const personalizedSubject = replaceTokens({
        text: subject,
        firstName: recipient.first_name,
        reviewLink: integration?.google_business_link,
      });

      const personalizedBody = replaceTokens({
        text: message,
        firstName: recipient.first_name,
        reviewLink: integration?.google_business_link,
      });

      const personalizedHtml = replaceTokens({
        text: htmlMessage,
        firstName: recipient.first_name,
        reviewLink: integration?.google_business_link,
      });

      try {
        // Format sender as "Gym Name <email>" if sender_profile exists
        const fromField = integration?.sender_profile
          ? `${integration.sender_profile} <${resendFromEmail}>`
          : resendFromEmail;

        await sendWithResend({
          apiKey: resendApiKey,
          from: fromField,
          to: recipient.email,
          subject: personalizedSubject,
          text: personalizedBody,
          html: personalizedHtml,
          replyTo: integration?.reply_to_email || undefined,
        });
        sent += 1;
      } catch (emailError) {
        failures.push({ recipient: maskEmail(recipient.email), error: emailError.message });
      }
    }

    return res.status(200).json({
      success: failures.length === 0,
      count: sent,
      failedCount: failures.length,
      failures,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
}
