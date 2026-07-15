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
    if (isHttpNotFoundError(error)) {
      return "Recording not found (HTTP 404). Check that the file still exists at its configured path and is accessible to FiftyOne.";
    }

    return error.message;
  }

  return fallback ?? String(error);
}

function isHttpNotFoundError(error: Error): boolean {
  return "code" in error && error.code === 404;
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
      error.message === MCAP_READ_CANCELLED_MESSAGE
    );
  }

  return false;
}

/** Typed boundary for readable message bytes that fail payload decoding. */
export class McapTopicDecodeError extends Error {
  readonly code = "message-decode-failed";
  readonly cause: unknown;
  readonly messageTimeNs: bigint;
  readonly payloadIdentity: string;
  readonly topic: string;

  constructor({
    cause,
    messageTimeNs,
    payloadIdentity,
    topic,
  }: {
    readonly cause: unknown;
    readonly messageTimeNs: bigint;
    readonly payloadIdentity: string;
    readonly topic: string;
  }) {
    super(mcapErrorMessage(cause, "Message decode failed"));
    this.name = "McapTopicDecodeError";
    this.cause = cause;
    this.messageTimeNs = messageTimeNs;
    this.payloadIdentity = payloadIdentity;
    this.topic = topic;
  }
}

/** Returns whether an error is a containable per-topic payload failure. */
export function isMcapTopicDecodeError(
  error: unknown,
): error is McapTopicDecodeError {
  return error instanceof McapTopicDecodeError;
}
