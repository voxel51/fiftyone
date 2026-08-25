/** Stable cancellation code shared across adapters and runtime consumers. */
export const EPISODE_READ_CANCELLED_CODE = "episode-read-cancelled";

/** Stable cancellation message across worker serialization boundaries. */
export const EPISODE_READ_CANCELLED_MESSAGE = "Episode read cancelled";

/** Canonical rejection for deliberately cancelled episode reads. */
export class EpisodeReadCancelledError extends Error {
  readonly code = EPISODE_READ_CANCELLED_CODE;

  constructor() {
    super(EPISODE_READ_CANCELLED_MESSAGE);
    setErrorName(this, "EpisodeReadCancelledError");
  }
}

/** Returns whether an error represents deliberate episode-read cancellation. */
export function isEpisodeReadCancelledError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly name?: unknown;
  };
  return (
    candidate.name === "AbortError" ||
    candidate.name === "EpisodeReadCancelledError" ||
    candidate.message === EPISODE_READ_CANCELLED_MESSAGE ||
    candidate.code === EPISODE_READ_CANCELLED_CODE
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
    setErrorName(this, "EpisodeReadUnsupportedError");
  }
}

/** Stable code for an unknown or stale-epoch exact-row cursor. */
export const EPISODE_EXACT_CURSOR_INVALID_CODE = "episode-exact-cursor-invalid";

/**
 * Typed rejection for an exact-row read whose cursor is unknown or belongs to
 * another source epoch. Raised instead of silently substituting a nearby row.
 */
export class EpisodeExactCursorError extends Error {
  readonly code = EPISODE_EXACT_CURSOR_INVALID_CODE;

  constructor(message: string) {
    super(message);
    setErrorName(this, "EpisodeExactCursorError");
  }
}

/** Returns whether an error represents an unknown or stale exact-row cursor. */
export function isEpisodeExactCursorError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    readonly code?: unknown;
    readonly name?: unknown;
  };
  return (
    candidate.name === "EpisodeExactCursorError" ||
    candidate.code === EPISODE_EXACT_CURSOR_INVALID_CODE
  );
}

/** Defines an own name even when the host freezes Error.prototype. */
function setErrorName(error: Error, name: string): void {
  Object.defineProperty(error, "name", { configurable: true, value: name });
}
