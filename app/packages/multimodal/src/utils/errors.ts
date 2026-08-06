/** Converts an unknown caught value into source-neutral error text. */
export function errorMessage(error: unknown, fallback?: string): string {
  return error instanceof Error ? error.message : (fallback ?? String(error));
}

/** Renders a caught value as non-empty user-visible diagnostic text. */
export function diagnosticMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }

  return fallback ?? String(error);
}

/** Converts an unknown caught value into an Error instance. */
export function toError(error: unknown, fallback?: string): Error {
  return error instanceof Error
    ? error
    : new Error(errorMessage(error, fallback));
}
