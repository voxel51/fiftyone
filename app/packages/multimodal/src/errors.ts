/** Converts unknown caught values into readable source-neutral error text. */
export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) {
    if (isHttpNotFoundError(error)) {
      return "Recording not found (HTTP 404). Check that the file still exists at its configured path and is accessible to FiftyOne.";
    }

    return error.message;
  }

  return fallback ?? String(error);
}

/** Converts unknown caught values into Error instances. */
export function toError(error: unknown, fallback?: string): Error {
  return error instanceof Error
    ? error
    : new Error(errorMessage(error, fallback));
}

function isHttpNotFoundError(error: Error): boolean {
  return "code" in error && error.code === 404;
}

/** Marker message for reads cancelled on purpose (seek, source change). */
export const READ_CANCELLED_MESSAGE = "Read cancelled";

/** Creates the canonical cancelled-read rejection. */
export function readCancelledError(): Error {
  return new Error(READ_CANCELLED_MESSAGE);
}

/** Returns whether a caught value represents deliberate read cancellation. */
export function isReadCancelledError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message === READ_CANCELLED_MESSAGE)
  );
}
