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

/**
 * Marker message for reads cancelled on purpose (seek, source change).
 * Crosses the worker boundary as text, so detection is message-based.
 */
export const MCAP_READ_CANCELLED_MESSAGE = "MCAP read cancelled";

/**
 * Creates the canonical cancelled-read rejection.
 */
export function mcapReadCancelledError(): Error {
  return new Error(MCAP_READ_CANCELLED_MESSAGE);
}

/**
 * Whether a caught value represents deliberate read cancellation. Consumers
 * must treat these as benign: no failure streaks, no retry spend, no error
 * UI — the data simply was not needed anymore.
 */
export function isMcapReadCancelledError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === "AbortError" ||
      error.message.includes(MCAP_READ_CANCELLED_MESSAGE)
    );
  }

  return false;
}
