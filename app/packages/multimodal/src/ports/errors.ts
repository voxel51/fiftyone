/** Stable cancellation code shared across adapters and runtime consumers. */
export const EPISODE_READ_CANCELLED_CODE = "episode-read-cancelled";

/** Canonical rejection for deliberately cancelled episode reads. */
export class EpisodeReadCancelledError extends Error {
  readonly code = EPISODE_READ_CANCELLED_CODE;

  constructor() {
    super("Episode read cancelled");
    this.name = "EpisodeReadCancelledError";
  }
}

/** Returns whether an error represents deliberate episode-read cancellation. */
export function isEpisodeReadCancelledError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "EpisodeReadCancelledError" ||
      ("code" in error && error.code === EPISODE_READ_CANCELLED_CODE))
  );
}
