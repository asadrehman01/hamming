import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { getEnv } from "./_env.js";

const VERIFY_WINDOW_MS = 15 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const attemptStore = new Map();

const getClientIp = (req) => {
  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = req.headers?.["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) {
    return realIp.trim();
  }
  return "unknown-ip";
};

const getAttemptKey = ({ userId, ip }) => `${userId}:${ip}`;

const getAttemptState = (key) => {
  const now = Date.now();
  const existing = attemptStore.get(key);
  if (!existing) {
    return { count: 0, firstAttemptAt: now, lockedUntil: 0 };
  }

  if (existing.lockedUntil && existing.lockedUntil > now) {
    return existing;
  }

  if (now - existing.firstAttemptAt > VERIFY_WINDOW_MS) {
    const reset = { count: 0, firstAttemptAt: now, lockedUntil: 0 };
    attemptStore.set(key, reset);
    return reset;
  }

  return existing;
};

const recordFailedAttempt = (key) => {
  const now = Date.now();
  const state = getAttemptState(key);
  const nextCount = (state.count || 0) + 1;

  if (nextCount >= MAX_VERIFY_ATTEMPTS) {
    const locked = {
      count: nextCount,
      firstAttemptAt: state.firstAttemptAt || now,
      lockedUntil: now + LOCKOUT_MS,
    };
    attemptStore.set(key, locked);
    return locked;
  }

  const updated = {
    count: nextCount,
    firstAttemptAt: state.firstAttemptAt || now,
    lockedUntil: 0,
  };
  attemptStore.set(key, updated);
  return updated;
};

const clearAttemptState = (key) => {
  if (attemptStore.has(key)) {
    attemptStore.delete(key);
  }
};

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

const timingSafeEqualText = (left, right) => {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");

  if (a.length !== b.length) {
    const maxLength = Math.max(a.length, b.length);
    const pa = Buffer.alloc(maxLength);
    const pb = Buffer.alloc(maxLength);
    a.copy(pa);
    b.copy(pb);
    crypto.timingSafeEqual(pa, pb);
    return false;
  }

  return crypto.timingSafeEqual(a, b);
};

const PBKDF2_ITERATIONS = 150000;

const hashPassword = (password, saltHex) => {
  const hash = crypto.pbkdf2Sync(
    String(password || ""),
    Buffer.from(saltHex, "hex"),
    PBKDF2_ITERATIONS,
    32,
    "sha256",
  );
  return hash.toString("hex");
};

const createPasswordRecord = (password) => {
  const saltHex = crypto.randomBytes(16).toString("hex");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashPassword(password, saltHex)}`;
};

const verifyStoredPassword = (password, storedPassword) => {
  const stored = String(storedPassword || "");
  if (stored.startsWith("pbkdf2$")) {
    const [, iterationsText, saltHex, expectedHash] = stored.split("$");
    const iterations = Number.parseInt(iterationsText, 10);
    if (!Number.isFinite(iterations) || !saltHex || !expectedHash) {
      return false;
    }
    const actualHash = crypto.pbkdf2Sync(
      String(password || ""),
      Buffer.from(saltHex, "hex"),
      iterations,
      32,
      "sha256",
    ).toString("hex");
    return timingSafeEqualText(actualHash, expectedHash);
  }

  return timingSafeEqualText(password, storedPassword);
};

const clearAttemptStateForUser = (userId) => {
  for (const key of attemptStore.keys()) {
    if (key.startsWith(`${userId}:`)) {
      attemptStore.delete(key);
    }
  }
};

const getServiceRoleClient = (supabaseUrl, serviceRoleKey) => {
  return createClient(supabaseUrl, serviceRoleKey);
};

const listAllAuthUsers = async (adminClient) => {
  const perPage = 1000;
  let page = 1;
  const users = [];

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const pageUsers = Array.isArray(data?.users) ? data.users : [];
    users.push(...pageUsers);

    if (pageUsers.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: "Missing Supabase environment variables." });
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
    const action = String(body?.action || "status").toLowerCase();

    // Fetch admin password from database (per-gym)
    if (!serviceRoleKey) {
      return res.status(500).json({ error: "Missing service role key." });
    }

    const admin = getServiceRoleClient(supabaseUrl, serviceRoleKey);

    if (action === "users") {
      const [{ data: gyms, error: gymError }, { data: billingSettings, error: billingError }, authUsers] = await Promise.all([
        admin
          .from("gyms")
          .select("id, name, created_at")
          .order("created_at", { ascending: false }),
        admin
          .from("billing_settings")
          .select("gym_id, gym_display_name"),
        listAllAuthUsers(admin),
      ]);

      if (gymError) {
        throw gymError;
      }

      if (billingError) {
        throw billingError;
      }

      const emailByUserId = new Map(
        authUsers.map((authUser) => [authUser.id, authUser.email || ""]),
      );

      const billingByGymId = new Map(
        (billingSettings || []).map((billing) => [billing.gym_id, billing.gym_display_name]),
      );

      const users = (gyms || []).map((gym) => ({
        id: gym.id,
        loginEmail: emailByUserId.get(gym.id) || "",
        gymName: billingByGymId.get(gym.id) || gym.name || "MY GYM",
        createdAt: gym.created_at,
      }));

      return res.status(200).json({
        totalUsers: users.length,
        users,
      });
    }

    const { data: gym, error: gymError } = await admin
      .from("gyms")
      .select("admin_password")
      .eq("id", user.id)
      .maybeSingle();

    if (gymError) {
      throw gymError;
    }

    if (!gym) {
      return res.status(404).json({ error: "Gym not found." });
    }

    if (action === "status") {
      return res.status(200).json({ hasPassword: Boolean(gym.admin_password) });
    }

    if (action === "verify") {
      if (!gym.admin_password) {
        return res.status(400).json({ error: "No admin password set. Please set one first." });
      }

      const ip = getClientIp(req);
      const key = getAttemptKey({ userId: user.id, ip });
      const state = getAttemptState(key);
      const now = Date.now();
      
      if (state.lockedUntil && state.lockedUntil > now) {
        const retryAfterSec = Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          error: "Too many failed admin password attempts. Try again later.",
          retryAfterSec,
        });
      }

      const password = String(body?.password || "").trim();
      const ok = verifyStoredPassword(password, gym.admin_password);

      if (ok) {
        clearAttemptState(key);
        return res.status(200).json({ valid: true });
      }

      const afterFail = recordFailedAttempt(key);
      if (afterFail.lockedUntil && afterFail.lockedUntil > Date.now()) {
        const retryAfterSec = Math.max(1, Math.ceil((afterFail.lockedUntil - Date.now()) / 1000));
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          valid: false,
          error: "Too many failed admin password attempts. Try again later.",
          retryAfterSec,
        });
      }

      return res.status(200).json({ valid: ok });
    }

    if (action === "set") {
      // Set admin password for the first time
      if (gym.admin_password) {
        return res.status(400).json({ error: "Admin password already set. Use 'change' to update." });
      }

      const newPassword = String(body?.password || "").trim();
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }

      const { error: updateError } = await admin
        .from("gyms")
        .update({ admin_password: newPassword })
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }

      clearAttemptStateForUser(user.id);
      return res.status(200).json({ message: "Admin password set successfully." });
    }

    if (action === "change") {
      // Change existing admin password
      if (!gym.admin_password) {
        return res.status(400).json({ error: "No admin password to change. Use 'set' to create one." });
      }

      const ip = getClientIp(req);
      const key = getAttemptKey({ userId: user.id, ip });
      const state = getAttemptState(key);
      const now = Date.now();

      if (state.lockedUntil && state.lockedUntil > now) {
        const retryAfterSec = Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          error: "Too many failed admin password attempts. Try again later.",
          retryAfterSec,
        });
      }

      const currentPassword = String(body?.currentPassword || "").trim();
      const newPassword = String(body?.newPassword || "").trim();

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters." });
      }

      // Verify current password first
      const ok = verifyStoredPassword(currentPassword, gym.admin_password);
      if (!ok) {
        const afterFail = recordFailedAttempt(key);
        if (afterFail.lockedUntil && afterFail.lockedUntil > Date.now()) {
          const retryAfterSec = Math.max(1, Math.ceil((afterFail.lockedUntil - Date.now()) / 1000));
          res.setHeader("Retry-After", String(retryAfterSec));
          return res.status(429).json({
            error: "Too many failed admin password attempts. Try again later.",
            retryAfterSec,
          });
        }
        return res.status(401).json({ error: "Current password is incorrect." });
      }

      const { error: updateError } = await admin
        .from("gyms")
        .update({ admin_password: createPasswordRecord(newPassword) })
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }

      clearAttemptStateForUser(user.id);
      return res.status(200).json({ message: "Admin password changed successfully." });
    }

    if (action === "reset") {
      // Reset password (requires current password for security)
      if (!gym.admin_password) {
        return res.status(400).json({ error: "No admin password to reset." });
      }

      const ip = getClientIp(req);
      const key = getAttemptKey({ userId: user.id, ip });
      const state = getAttemptState(key);
      const now = Date.now();

      if (state.lockedUntil && state.lockedUntil > now) {
        const retryAfterSec = Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          error: "Too many failed admin password attempts. Try again later.",
          retryAfterSec,
        });
      }

      const currentPassword = String(body?.currentPassword || "").trim();
      const ok = verifyStoredPassword(currentPassword, gym.admin_password);
      if (!ok) {
        const afterFail = recordFailedAttempt(key);
        if (afterFail.lockedUntil && afterFail.lockedUntil > Date.now()) {
          const retryAfterSec = Math.max(1, Math.ceil((afterFail.lockedUntil - Date.now()) / 1000));
          res.setHeader("Retry-After", String(retryAfterSec));
          return res.status(429).json({
            error: "Too many failed admin password attempts. Try again later.",
            retryAfterSec,
          });
        }
        return res.status(401).json({ error: "Current password is required to reset." });
      }

      const { error: updateError } = await admin
        .from("gyms")
        .update({ admin_password: null })
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }

      clearAttemptStateForUser(user.id);
      return res.status(200).json({ message: "Admin password reset successfully. Set a new one with 'set' action." });
    }

    return res.status(400).json({ error: `Unsupported action: ${action}` });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
}
