import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getEnv } from "../_env.js";

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

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");

const validatePasswordComplexity = (pw) => {
  if (!pw || pw.length < 8) return false;
  if (!/[A-Z]/.test(pw)) return false;
  if (!/\d/.test(pw)) return false;
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]/.test(pw)) return false;
  return true;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: "Missing Supabase server environment variables." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
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

    // Update user password via Supabase Admin API (service role)
    const { data: updatedUser, error: updateErr } = await admin.auth.admin.updateUserById(resetToken.user_id, {
      password: newPassword,
    });

    if (updateErr) {
      console.error("Failed to update user password:", updateErr);
      return res.status(500).json({ error: "Failed to update password. Please try again." });
    }

    // Mark token used
    const { error: tokenErr } = await admin
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("id", resetToken.id)
      .eq("used", false);

    if (tokenErr) {
      console.error("Failed to mark token used:", tokenErr);
      // Continue — don't leak to client
    }

    // Invalidate all sessions for this user
    try {
      if (admin?.auth?.admin?.invalidateUserSessions) {
        await admin.auth.admin.invalidateUserSessions(resetToken.user_id);
      }
    } catch (e) {
      console.error("Failed to invalidate user sessions:", e);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("reset-password error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown server error" });
  }
}
