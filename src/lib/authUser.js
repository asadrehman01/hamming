export const isTransientAuthLockError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("lock broken") || message.includes("steal option");
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getUserWithRetry = async (supabase, maxRetries = 5) => {
  let lastResponse = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await supabase.auth.getUser();
    lastResponse = response;

    if (!response?.error) {
      return response;
    }

    if (!isTransientAuthLockError(response.error) || attempt === maxRetries) {
      return response;
    }

    const backoffMs = 180 * 2 ** attempt;
    const jitterMs = Math.floor(Math.random() * 70);
    await sleep(backoffMs + jitterMs);
  }

};
