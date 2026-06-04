export const isTransientAuthLockError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("lock broken") ||
    message.includes("steal option") ||
    message.includes("forbidden") ||
    message.includes("unauthorized") ||
    message.includes("invalid refresh token") ||
    message.includes("jwt expired")
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pendingUserRequests = new WeakMap();

export const getUserWithRetry = async (supabase, maxRetries = 5) => {
  if (!supabase) {
    return { data: { user: null }, error: new Error("Supabase client is not initialized.") };
  }

  const pendingRequest = pendingUserRequests.get(supabase);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = (async () => {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const response = await supabase.auth.getUser();

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

    return supabase.auth.getUser();
  })();

  pendingUserRequests.set(supabase, request);

  try {
    return await request;
  } finally {
    if (pendingUserRequests.get(supabase) === request) {
      pendingUserRequests.delete(supabase);
    }
  }
};
