import { createClient } from "@supabase/supabase-js";
import { supabase } from "../src/lib/supabaseClient.js";
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

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const maskPhone = (value) => {
  const phone = normalizePhone(value);
  if (phone.length < 4) return "[redacted]";
  return `${phone.slice(0, 2)}***${phone.slice(-2)}`;
};

const isActiveMember = (membershipEndDate) => {
  if (!membershipEndDate) return true;
  const end = new Date(membershipEndDate);
  if (Number.isNaN(end.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return end >= now;
};

const trimSms = (value, limit = 160) => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
};

const sendSMS = async (phoneNumber, message) => {
  if (!supabase) {
    const error = new Error("Supabase client is not configured.");
    console.error("SMS failed:", error);
    return { data: null, error };
  }

  const { data, error } = await supabase.functions.invoke("send-sms", {
    body: {
      to: `+91${phoneNumber}`,
      message: message,
    },
  });
  if (error) console.error("SMS failed:", error);
  return { data, error };
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return res.status(500).json({ error: "Missing Supabase server environment variables." });
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
    const recipientPhoneRaw = String(body?.recipientPhone || body?.recipientEmail || "").trim();

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
      const normalizedPhone = normalizePhone(recipientPhoneRaw);
      if (!normalizedPhone) {
        return res.status(400).json({ error: "recipientPhone is required for INDIVIDUAL recipientGroup." });
      }

      recipients = [
        {
          phone: normalizedPhone,
          first_name: "there",
          membership_end_date: null,
        },
      ];
    } else {
      const { data: customers, error: customerError } = await admin
        .from("customers")
        .select("phone, first_name, membership_end_date")
        .eq("gym_id", user.id)
        .not("phone", "is", null);

      if (customerError) {
        throw customerError;
      }

      const baseRecipients = Array.from(
        new Map((customers || []).filter((row) => row.phone).map((row) => [normalizePhone(row.phone), row])).values(),
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
        const smsBody = trimSms(
          `${personalizedSubject}: ${personalizedBody || personalizedHtml}`,
        );
        await sendSMS(normalizePhone(recipient.phone), smsBody);
        sent += 1;
      } catch (emailError) {
        failures.push({ recipient: maskPhone(recipient.phone), error: emailError.message });
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
