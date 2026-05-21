/**
 * Converts unknown caught values into Error instances.
 */
export function mcapError(error: unknown, fallback?: string): Error {
  return error instanceof Error
    ? error
    : new Error(mcapErrorMessage(error, fallback));
}

/**
 * Converts unknown caught values into readable MCAP error text.
 */
export function mcapErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback ?? String(error);
}
