import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getEnv } from "./_env.js";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const GENERIC_MESSAGE =
  "If this email is registered, a reset link has been sent.";
const INVALID_MESSAGE =
  "This link has expired or has already been used. Please request a new one.";
const PBKDF2_ITERATIONS = 150000;

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

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

const resolveBaseUrl = (req) => {
  const fromEnv = getEnv("APP_BASE_URL", "VITE_APP_URL", "VITE_SITE_URL");
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }

  const host =
    req.headers?.["x-forwarded-host"] ||
    req.headers?.host ||
    req.headers?.Host;
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  if (host) {
    return `${proto}://${host}`;
  }

  return "https://yourdomain.com";
};

const sendWithResend = async ({ apiKey, from, to, subject, text, html }) => {
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
    throw new Error(
      `Resend error ${response.status}: ${textBody || response.statusText}`,
    );
  }

  return response.json().catch(() => ({}));
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");

const hashAdminPassword = (password) => {
  const saltHex = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(
    String(password || ""),
    Buffer.from(saltHex, "hex"),
    PBKDF2_ITERATIONS,
    32,
    "sha256",
  );

  return {
    passwordHash: hash.toString("hex"),
    passwordSalt: saltHex,
  };
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = getEnv("RESEND_API_KEY");
    const resendFromEmail = getEnv("RESEND_FROM_EMAIL");

    if (!supabaseUrl || !serviceRoleKey) {
      return res
        .status(500)
        .json({ error: "Missing Supabase server environment variables." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = parseBody(req);
    const action = String(body?.action || "").toLowerCase();

    if (action === "request") {
      const rawEmail = normalizeEmail(body?.email || "");
      if (!rawEmail || !isValidEmail(rawEmail)) {
        return res.status(200).json({ message: GENERIC_MESSAGE });
      }

      const { data: userData, error: userError } =
        await admin.auth.admin.getUserByEmail(rawEmail);

      if (userError || !userData?.user?.id) {
        return res.status(200).json({ message: GENERIC_MESSAGE });
      }

      const userId = userData.user.id;
      const { data: gym } = await admin
        .from("gyms")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (!gym?.id) {
        return res.status(200).json({ message: GENERIC_MESSAGE });
      }

      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count } = await admin
        .from("password_reset_tokens")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", "admin")
        .gte("created_at", since);

      if (Number(count || 0) >= RATE_LIMIT_MAX) {
        return res.status(200).json({ message: GENERIC_MESSAGE });
      }

      if (!resendApiKey || !resendFromEmail) {
        return res
          .status(500)
          .json({ error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL." });
      }

      const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

      const { error: insertError } = await admin
        .from("password_reset_tokens")
        .insert({
          user_id: userId,
          token: tokenHash,
          type: "admin",
          expires_at: expiresAt,
          used: false,
        });

      if (insertError) {
        throw insertError;
      }

      const baseUrl = resolveBaseUrl(req);
      const resetUrl = `${baseUrl}/reset-admin-password?token=${rawToken}`;

      const subject = "Reset your admin password";
      const text = `You requested an admin password reset.\n\nReset Admin Password: ${resetUrl}\n\nThis link expires in 15 minutes. If you did not request this, you can ignore this email.`;
      const html = `
        <div style="font-family: 'DM Sans', Arial, sans-serif; line-height: 1.6; color: #0A0A0A;">
          <p>You requested an admin password reset.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#0A0A0A;color:#ffffff;text-decoration:none;font-weight:600;letter-spacing:0.08em;font-size:12px;">
              Reset Admin Password
            </a>
          </p>
          <p style="font-size:12px;color:#6B6360;">This link expires in 15 minutes. If you did not request this, you can ignore this email.</p>
        </div>
      `;

      await sendWithResend({
        apiKey: resendApiKey,
        from: resendFromEmail,
        to: rawEmail,
        subject,
        text,
        html,
      });

      return res.status(200).json({ message: GENERIC_MESSAGE });
    }

    if (action === "reset") {
      const token = String(body?.token || "").trim();
      const newPassword = String(body?.newPassword || "");

      if (!token || newPassword.length < 8) {
        return res.status(400).json({ error: INVALID_MESSAGE });
      }

      const tokenHash = hashToken(token);
      const nowIso = new Date().toISOString();
      const { data: resetToken } = await admin
        .from("password_reset_tokens")
        .select("id, user_id, expires_at, used, type")
        .eq("token", tokenHash)
        .eq("type", "admin")
        .maybeSingle();

      if (
        !resetToken ||
        resetToken.used ||
        !resetToken.expires_at ||
        resetToken.expires_at <= nowIso
      ) {
        return res.status(400).json({ error: INVALID_MESSAGE });
      }

      const { passwordHash, passwordSalt } = hashAdminPassword(newPassword);
      const { error: updateError } = await admin
        .from("admin_credentials")
        .upsert(
          {
            user_id: resetToken.user_id,
            password_hash: passwordHash,
            password_salt: passwordSalt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      if (updateError) {
        throw updateError;
      }

      const { error: tokenError } = await admin
        .from("password_reset_tokens")
        .update({ used: true })
        .eq("id", resetToken.id)
        .eq("used", false);

      if (tokenError) {
        throw tokenError;
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unsupported action" });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
}
