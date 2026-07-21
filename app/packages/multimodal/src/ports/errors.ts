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
