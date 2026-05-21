const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isTransientRequestError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("load failed") ||
    message.includes("network error") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("504") ||
    message.includes("429") ||
    message.includes("service unavailable") ||
    message.includes("gateway") ||
    message.includes("lock broken") ||
    message.includes("steal option")
  );
};

export const withTransientRetry = async (
  operation,
  { retries = 2, baseDelayMs = 250 } = {},
) => {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientRequestError(error) || attempt === retries) {
        throw error;
      }

      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  throw lastError;
};