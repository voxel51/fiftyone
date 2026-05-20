/**
 * Converts unknown caught values into readable MCAP error text.
 */
export function mcapErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback ?? String(error);
}
