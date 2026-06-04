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

const sanitize = (value) => String(value || "").trim();

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const resendApiKey = getEnv("RESEND_API_KEY");
    const resendFromEmail = getEnv("RESEND_FROM_EMAIL");
    const reportRecipient = getEnv("BUG_REPORT_RECIPIENT_EMAIL", "BUG_REPORT_RECIPIENT");

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: "Missing Supabase server environment variables." });
    }

    if (!resendApiKey || !resendFromEmail) {
      return res.status(500).json({ error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL." });
    }

    if (!reportRecipient) {
      return res.status(500).json({ error: "Missing BUG_REPORT_RECIPIENT_EMAIL." });
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

    const body = parseBody(req);
    const title = sanitize(body?.title);
    const description = sanitize(body?.description);
    const stepsToReproduce = sanitize(body?.stepsToReproduce);
    const severity = sanitize(body?.severity || "Medium");
    const pagePath = sanitize(body?.pagePath);
    const pageUrl = sanitize(body?.pageUrl);
    const reporterName = sanitize(body?.reporterName);
    const reporterEmail = sanitize(body?.reporterEmail || user.email);

    if (title.length > 256) {
      return res.status(400).json({ error: "title must be 256 characters or fewer." });
    }

    if (description.length > 5000) {
      return res.status(400).json({ error: "description must be 5000 characters or fewer." });
    }

    if (reporterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)) {
      return res.status(400).json({ error: "reporterEmail must be a valid email address." });
    }

    if (!title || !description) {
      return res.status(400).json({ error: "title and description are required." });
    }

    if (!reportRecipient) {
      return res.status(500).json({ error: "Missing BUG_REPORT_RECIPIENT_EMAIL." });
    }

    const subject = `[Bug Report] ${title}`;
    const text = [
      "New bug report submitted",
      "",
      `Title: ${title}`,
      `Severity: ${severity}`,
      `Reported by: ${reporterName || "Unknown"}`,
      `Report id: ${user.id}-${Date.now()}`,
      `Page path: ${pagePath || "Not provided"}`,
      `Page URL: ${pageUrl || "Not provided"}`,
      "",
      "Description:",
      description,
      "",
      "Steps to reproduce:",
      stepsToReproduce || "Not provided",
    ].join("\n");

    await sendWithResend({
      apiKey: resendApiKey,
      from: resendFromEmail,
      to: reportRecipient,
      subject,
      text,
      replyTo: reporterEmail || undefined,
    });

    return res.status(200).json({ success: true, message: "Bug report submitted." });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
}
