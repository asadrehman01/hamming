import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getEnv } from "../_env.js";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const GENERIC_OK = { success: true };

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

const getBearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== "string") return "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");

const resolveBaseUrl = (req) => {
  const fromEnv = getEnv("APP_BASE_URL", "VITE_APP_URL", "VITE_SITE_URL");
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host || req.headers?.Host;
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  if (host) return `${proto}://${host}`;
  return "https://yourdomain.com";
};

const sendWithResend = async ({ apiKey, from, to, subject, text, html }) => {
  const normalizedText = String(text || "").trim();
  const normalizedHtml = String(html || "").trim();

  if (!normalizedText && !normalizedHtml) {
    throw new Error("Email payload must include text or html content.");
  }

  const payload = { from, to: [to], subject };
  if (normalizedText) payload.text = normalizedText;
  if (normalizedHtml) payload.html = normalizedHtml;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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
      return res.status(500).json({ error: "Missing Supabase environment variables." });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing Authorization bearer token." });

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id) return res.status(401).json({ error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Rate limit: max 3 per user per hour
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count } = await admin
      .from("password_reset_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "login")
      .gte("created_at", since);

    if (Number(count || 0) >= RATE_LIMIT_MAX) {
      console.warn("Password reset rate limit reached:", { userId: user.id, count, RATE_LIMIT_MAX });
      return res.status(200).json(GENERIC_OK);
    }

    // Delete existing unused tokens for this user + type
    await admin
      .from("password_reset_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("type", "login")
      .eq("used", false);

    // Create new token
    const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

    const { error: insertError } = await admin.from("password_reset_tokens").insert({
      user_id: user.id,
      token: tokenHash,
      type: "login",
      expires_at: expiresAt,
      used: false,
    });

    if (insertError) {
      console.error("Failed to insert password reset token:", insertError);
      // Continue — do not reveal to client
    }

    // Send email (best-effort). Always return generic success.
    try {
      if (resendApiKey && resendFromEmail && user.email) {
        const baseUrl = resolveBaseUrl(req);
        const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
        const subject = "Reset your Hamming password";
        const text = `You requested a password reset for your Hamming account.\n\nReset Password: ${resetUrl}\n\nThis link expires in 15 minutes and can only be used once. If you did not request this, you can safely ignore this email.`;
        const html = `
          <div style="font-family: Arial, sans-serif; line-height:1.5; color:#0A0A0A;">
            <p>You requested a password reset for your Hamming account.</p>
            <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#0A0A0A;color:#fff;text-decoration:none;font-weight:600;">Reset Password</a></p>
            <p style="font-size:12px;color:#6B6360;">This link expires in 15 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>
          </div>
        `;
        await sendWithResend({ apiKey: resendApiKey, from: resendFromEmail, to: user.email, subject, text, html });
      }
    } catch (emailErr) {
      console.error("Failed to send password reset email:", emailErr);
    }

    return res.status(200).json(GENERIC_OK);
  } catch (err) {
    console.error("send-password-reset error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown server error" });
  }
}
