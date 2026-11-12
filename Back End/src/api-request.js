export function createApiRequest(apiBaseUrl, fetcher = globalThis.fetch) {
  return async function apiRequest(path, options = {}) {
    let response;
    try { response = await fetcher(`${apiBaseUrl}${path}`, {
      credentials: "include",
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
    }); } catch (cause) {
      throw new Error("Unable to reach the payment server. Check your connection and try again.", { cause });
    }
    let unreadableResponse = false;
    const payload = response.status === 204 ? null : await response.json().catch(() => { unreadableResponse = true; return null; });
    if (!response.ok) {
      const detail = payload?.detail;
      const validationErrors = detail?.errors || payload?.errors || (Array.isArray(detail) ? detail : null);
      const fieldErrors = Array.isArray(validationErrors) && validationErrors.map((item) => `${item.field || item.loc?.join(".")}: ${item.message || item.msg}`).join("; ");
      const fallback = {
        401: "Your session has expired. Reload the page and sign in again.",
        403: "You do not have permission to perform this action.",
        404: "This record is unavailable or you no longer have access.",
        409: "This record changed. Reload the latest version before continuing.",
        422: "Review the entered values and try again.",
        429: "Too many requests. Wait a moment before trying again.",
      }[response.status] || (response.status >= 500 ? "The payment server is temporarily unavailable. Try again shortly." : "Unable to complete this action. Try again.");
      const message = response.status === 401 && !path.endsWith("/auth/login") ? fallback : fieldErrors || detail?.message || (typeof detail === "string" ? detail : "") || fallback;
      const error = new Error(message);
      error.status = response.status;
      error.details = detail;
      throw error;
    }
    if (unreadableResponse) {
      throw new Error("The server returned an unreadable response. Reload to check whether your changes were saved before trying again.");
    }
    return payload;
  };
}
