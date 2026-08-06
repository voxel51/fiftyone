/** Standard identity assigned to caller-requested cancellation errors. */
export const ABORT_ERROR_NAME = "AbortError";

/** Default message for cancellation without more useful operation context. */
export const DEFAULT_ABORT_ERROR_MESSAGE = "The operation was aborted";

/** Creates a fresh, worker-safe cancellation error with standard identity. */
export function createAbortError(message = DEFAULT_ABORT_ERROR_MESSAGE): Error {
  const error = new Error(message);
  error.name = ABORT_ERROR_NAME;
  return error;
}

/** Throws a fresh cancellation error when the optional signal is aborted. */
export function throwIfAborted(
  signal: AbortSignal | null | undefined,
  message = DEFAULT_ABORT_ERROR_MESSAGE,
): void {
  if (signal?.aborted) {
    throw createAbortError(message);
  }
}
