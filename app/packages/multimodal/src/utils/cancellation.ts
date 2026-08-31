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

/** Links an epoch signal with one optional request signal. */
export function linkAbortSignals(
  epochSignal: AbortSignal,
  requestSignal?: AbortSignal,
): { readonly cleanup: () => void; readonly signal: AbortSignal } {
  if (!requestSignal) {
    return { cleanup: () => undefined, signal: epochSignal };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (epochSignal.aborted || requestSignal.aborted) {
    controller.abort();
  } else {
    epochSignal.addEventListener("abort", abort, { once: true });
    requestSignal.addEventListener("abort", abort, { once: true });
  }
  return {
    cleanup: () => {
      epochSignal.removeEventListener("abort", abort);
      requestSignal.removeEventListener("abort", abort);
    },
    signal: controller.signal,
  };
}
