import { supabase } from "./supabaseClient";

const configuredApiBase = String(import.meta.env.VITE_BACKEND_API_BASE_URL || "").trim();
const normalizeBaseUrl = (baseUrl) => baseUrl.replace(/\/+$/, "");
const endpointToFunctionName = {
  "/api/broadcast-email": "broadcast-email",
  "/api/run-auto-migration": "run-auto-migration",
  "/api/bug-report": "bug-report",
  "/api/admin-users": "admin-users",
};

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
    .replace(/authorization\s*:\s*bearer\s+[A-Za-z0-9._\-]+/gi, "authorization: bearer [redacted]")
    .replace(/bearer\s+[A-Za-z0-9._\-]+/gi, "bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");

  return redacted.slice(0, 200);
};

const parseFunctionError = (payload) => {
  if (!payload) return "Request failed";
  if (typeof payload.error === "string") return payload.error;
  if (payload.error) return JSON.stringify(payload.error);
  if (typeof payload.message === "string") return payload.message;
  return "Request failed";
};

const invokeEdgeFallback = async (path, body, originalError = null) => {
  const functionName = endpointToFunctionName[path];
  if (!functionName) {
    if (originalError) throw originalError;
    throw new Error(`No fallback available for endpoint: ${path}`);
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: body || {},
  });

  if (error) {
    throw new Error(error.message || String(error));
  }

  if (data?.error) {
    throw new Error(parseFunctionError(data));
  }

  return data || {};
};

export const postBackendApi = async (path, body) => {
  // If no backend API base is configured, route directly to Edge Functions.
  if (!configuredApiBase) {
    await getAuthToken();
    return invokeEdgeFallback(path, body);
  }

  const token = await getAuthToken();
  const url = buildApiUrl(path);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body || {}),
    });
  } catch (networkError) {
    return invokeEdgeFallback(path, body, networkError);
  }

  if (!response.ok) {
    if (response.status === 404) {
      return invokeEdgeFallback(
        path,
        body,
        new Error(
          `Backend endpoint not found: ${url}. Set VITE_BACKEND_API_BASE_URL or run your backend API server.`,
        ),
      );
    }
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
    const isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
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
  return postBackendApi("/api/admin-users", {});
};
