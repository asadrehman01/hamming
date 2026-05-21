import { supabase } from "./supabaseClient";
import { withTransientRetry } from "./transientRequest";

const configuredApiBase = String(import.meta.env.VITE_BACKEND_API_BASE_URL || "").trim();
const normalizeBaseUrl = (baseUrl) => baseUrl.replace(/\/+$/, "");

const buildApiUrl = (path) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (configuredApiBase) {
    return `${normalizeBaseUrl(configuredApiBase)}${path}`;
  }

  return path;
};

const getAuthToken = async () => {
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.access_token) {
    throw new Error("Missing auth session. Please sign in again.");
  }

  return session.access_token;
};

const parseApiError = async (response) => {
  try {
    const payload = await response.json();
    if (payload?.error) return payload.error;
    if (payload?.message) return payload.message;
  } catch {
    // Ignore JSON parse errors and fall back to status text.
  }

  return response.statusText || "Request failed";
};

const sanitizeResponseBody = (body) => {
  const normalized = String(body || "");
  const redacted = normalized
    .replace(/authorization\s*:\s*bearer\s+[A-Za-z0-9._-]+/gi, "authorization: bearer [redacted]")
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, "bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");

  return redacted.slice(0, 200);
};

export const postBackendApi = async (path, body) => {
  const token = await getAuthToken();
  const url = buildApiUrl(path);

  let response;
  try {
    response = await withTransientRetry(async () => {
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body || {}),
      });
    });
  } catch (networkError) {
    throw new Error(`Network error: ${networkError.message}`);
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const responseClone = response.clone();
  try {
    return await response.json();
  } catch (err) {
    let responseText = "";
    try {
      responseText = await responseClone.text();
    } catch (readError) {
      console.error("Failed to read response text after JSON parse error:", readError);
    }
    const isProduction = import.meta.env.MODE === "production";
    const bodyDetails = isProduction
      ? { bodyLength: responseText.length }
      : { body: sanitizeResponseBody(responseText) };
    console.error("Failed to parse API response JSON:", {
      url: response.url,
      status: response.status,
      error: err,
      ...bodyDetails,
    });
    throw new Error(`Failed to parse response (${response.status}).`);
  }
};

export const getBackendApi = async (path) => {
  const token = await getAuthToken();
  const url = buildApiUrl(path);

  let response;
  try {
    response = await withTransientRetry(async () => {
      return fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    });
  } catch (networkError) {
    throw new Error(`Network error: ${networkError.message}`);
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json();
};

const ensureBroadcastDelivery = (responsePayload) => {
  if (!responsePayload || typeof responsePayload !== "object") {
    return responsePayload;
  }

  const failedCount = Number(responsePayload.failedCount || 0);
  if (responsePayload.success === false || failedCount > 0) {
    const firstFailure = Array.isArray(responsePayload.failures)
      ? responsePayload.failures[0]
      : null;
    const reason = firstFailure?.error || responsePayload.message || "Email delivery failed.";
    throw new Error(reason);
  }

  return responsePayload;
};

export const sendBroadcastEmail = async (payload) =>
  ensureBroadcastDelivery(await postBackendApi("/api/broadcast-email", payload));

export const runAutoMigrationOnServer = async (payload) =>
  postBackendApi("/api/run-auto-migration", payload);

export const sendBugReport = async (payload) =>
  postBackendApi("/api/bug-report", payload);

export const fetchAdminUsers = async () => {
  return postBackendApi("/api/admin-auth", { action: "users" });
};

// ─────────────────────────────────────────────────────────────────────────────
// Member ID Settings & Preview
// ─────────────────────────────────────────────────────────────────────────────
export const fetchIdSettings = async () => getBackendApi("/api/gym?type=id-settings");
export const saveIdSettings = async (payload) => postBackendApi("/api/gym?type=id-settings", payload);
export const previewMemberId = async (payload) => postBackendApi("/api/gym?type=preview-id", payload);

// ─────────────────────────────────────────────────────────────────────────────
// Scanner Integration & Mapping
// ─────────────────────────────────────────────────────────────────────────────
export const fetchUnmappedIds = async () => getBackendApi("/api/scanner?type=unmapped-ids");
export const mapScannerMember = async (payload) => postBackendApi("/api/scanner?type=map-member", payload);
export const autoMapScannerMembers = async () => postBackendApi("/api/scanner?type=auto-map", {});

// Additional scanner settings
export const testScannerConnection = async (payload) => postBackendApi("/api/scanner?type=test-connection", payload);
export const syncScanner = async (payload) => postBackendApi("/api/scanner?type=sync", payload);
export const enrollScannerMember = async (payload) => postBackendApi("/api/scanner?type=enroll", payload);
export const unenrollScannerMember = async (payload) => postBackendApi("/api/scanner?type=unenroll", payload);