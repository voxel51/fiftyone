const DEFAULT_MAX_RETRIES = 10;
const DEFAULT_BASE_DELAY = 200;

export const fetchWithLinearBackoff = async (
  url: string,
  retries = DEFAULT_MAX_RETRIES,
  delay = DEFAULT_BASE_DELAY
) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      return response;
    } catch (e) {
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      } else {
        throw new Error(
          "Max retries for fetch reached (linear backoff), error: " + e
        );
      }
    }
  }
  return null;
};
