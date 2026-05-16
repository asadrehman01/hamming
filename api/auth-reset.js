import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getEnv } from "./_env.js";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const GENERIC_OK = { success: true };
const GENERIC_INVALID = "This link is invalid or has already been used. Please request a new one.";

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

const getAction = (req) => {
  const body = parseBody(req);
  const url = new URL(req.url || "http://localhost");
  const pathname = url.pathname.replace(/\/+$/, "");
  const pathAction = pathname.startsWith("/api/auth-reset/")
    ? pathname.slice("/api/auth-reset/".length)
    : "";

  return String(req.query?.action || req.query?.type || body?.action || pathAction || (body?.token ? "reset" : "request")).toLowerCase();
};

const getBearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== "string") return "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
};

const hashToken = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

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

const validatePasswordComplexity = (password) => {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return false;
  return true;
};

const handleRequestReset = async (req, res, user, admin, resendApiKey, resendFromEmail) => {
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

  await admin
    .from("password_reset_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("type", "login")
    .eq("used", false);

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
  }

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
  } catch (emailError) {
    console.error("Failed to send password reset email:", emailError);
  }

  return res.status(200).json(GENERIC_OK);
};

const handleResetPassword = async (req, res, admin) => {
  const body = parseBody(req);
  const token = String(body?.token || "").trim();
  const newPassword = String(body?.newPassword || "");
  const confirmPassword = String(body?.confirmPassword || "");

  if (!token) {
    return res.status(400).json({ error: GENERIC_INVALID });
  }

  if (!newPassword || !confirmPassword || newPassword !== confirmPassword) {
    return res.status(400).json({ error: "Passwords must match and cannot be empty." });
  }

  if (!validatePasswordComplexity(newPassword)) {
    return res.status(400).json({ error: "Password does not meet complexity requirements." });
  }

  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();

  const { data: resetToken } = await admin
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used, type")
    .eq("token", tokenHash)
    .eq("type", "login")
    .maybeSingle();

  if (!resetToken || resetToken.used || !resetToken.expires_at || resetToken.expires_at <= nowIso) {
    return res.status(400).json({ error: GENERIC_INVALID });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(resetToken.user_id, {
    password: newPassword,
  });

  if (updateError) {
    console.error("Failed to update user password:", updateError);
    return res.status(500).json({ error: "Failed to update password. Please try again." });
  }

  const { error: tokenError } = await admin
    .from("password_reset_tokens")
    .update({ used: true })
    .eq("id", resetToken.id)
    .eq("used", false);

  if (tokenError) {
    console.error("Failed to mark token used:", tokenError);
  }

  try {
    if (admin?.auth?.admin?.invalidateUserSessions) {
      await admin.auth.admin.invalidateUserSessions(resetToken.user_id);
    }
  } catch (error) {
    console.error("Failed to invalidate user sessions:", error);
  }

  return res.status(200).json({ success: true });
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

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const action = getAction(req);

    if (action === "reset") {
      return handleResetPassword(req, res, admin);
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing Authorization bearer token." });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    return handleRequestReset(req, res, user, admin, resendApiKey, resendFromEmail);
  } catch (error) {
    console.error("auth-reset error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown server error" });
  }
}
