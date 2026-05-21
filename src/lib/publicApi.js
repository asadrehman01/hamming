import { withTransientRetry } from "./transientRequest";

const configuredApiBase = String(import.meta.env.VITE_BACKEND_API_BASE_URL || "").trim();

const normalizeBaseUrl = (baseUrl) => baseUrl.replace(/\/+$/, "");

export const buildPublicApiUrl = (path) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (configuredApiBase) {
    return `${normalizeBaseUrl(configuredApiBase)}${path}`;
  }

  return path;
};

const parsePublicApiError = async (response) => {
  try {
    const payload = await response.json();
    if (payload?.error) return payload.error;
    if (payload?.message) return payload.message;
  } catch {
    // Ignore JSON parsing errors.
  }

  return response.statusText || "Request failed";
};

export const postPublicApi = async (path, body) => {
  const url = buildPublicApiUrl(path);

  const response = await withTransientRetry(async () => {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });
  });

  if (!response.ok) {
    throw new Error(await parsePublicApiError(response));
  }

  return response.json();
};
