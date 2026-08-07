/** Stable cancellation code shared across adapters and runtime consumers. */
export const EPISODE_READ_CANCELLED_CODE = "episode-read-cancelled";

/** Stable cancellation message across worker serialization boundaries. */
export const EPISODE_READ_CANCELLED_MESSAGE = "Episode read cancelled";

/** Canonical rejection for deliberately cancelled episode reads. */
export class EpisodeReadCancelledError extends Error {
  readonly code = EPISODE_READ_CANCELLED_CODE;

  constructor() {
    super(EPISODE_READ_CANCELLED_MESSAGE);
    this.name = "EpisodeReadCancelledError";
  }
}

/** Returns whether an error represents deliberate episode-read cancellation. */
export function isEpisodeReadCancelledError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "EpisodeReadCancelledError" ||
      error.message === EPISODE_READ_CANCELLED_MESSAGE ||
      ("code" in error && error.code === EPISODE_READ_CANCELLED_CODE))
  );
}

/** Stable code for a generic read that cannot prove bounded correctness. */
export const EPISODE_READ_UNSUPPORTED_CODE = "episode-read-unsupported";

/**
 * Typed failure returned instead of scanning unbounded history or publishing a
 * semantically incorrect prefix from a generic adapter.
 */
export class EpisodeReadUnsupportedError extends Error {
  readonly code = EPISODE_READ_UNSUPPORTED_CODE;

  constructor(
    readonly operation: string,
    message: string,
  ) {
    super(message);
    this.name = "EpisodeReadUnsupportedError";
  }
}
