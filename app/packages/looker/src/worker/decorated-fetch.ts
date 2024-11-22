const DEFAULT_MAX_RETRIES = 10;
const DEFAULT_BASE_DELAY = 200;
// list of HTTP status codes that are client errors (4xx) and should not be retried
const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404, 405, 422];

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

export const fetchWithLinearBackoff = async (
  url: string,
  opts: RequestInit = {},
  retries = DEFAULT_MAX_RETRIES,
  delay = DEFAULT_BASE_DELAY
) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, opts);
      if (response.ok) {
        return response;
      } else {
        if (NON_RETRYABLE_STATUS_CODES.includes(response.status)) {
          throw new NonRetryableError(
            `Non-retryable HTTP error: ${response.status}`
          );
        } else {
          // retry on other HTTP errors (e.g., 500 Internal Server Error)
          throw new Error(`HTTP error: ${response.status}`);
        }
      }
    } catch (e) {
      if (e instanceof NonRetryableError) {
        // immediately throw
        throw e;
      }
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      } else {
        // max retries reached
        throw new Error(
          "Max retries for fetch reached (linear backoff), error: " + e
        );
      }
    }
  }
  return null;
};
