/** Converts an unknown caught value into source-neutral error text. */
export function errorMessage(error: unknown, fallback?: string): string {
  return error instanceof Error ? error.message : (fallback ?? String(error));
}

/** Converts an unknown caught value into an Error instance. */
export function toError(error: unknown, fallback?: string): Error {
  return error instanceof Error
    ? error
    : new Error(errorMessage(error, fallback));
}
