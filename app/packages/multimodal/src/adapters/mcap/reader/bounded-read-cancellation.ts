import type { ReadWorkUsage } from "../../../ports";

/** Best-effort work known to have completed before a bounded read stopped. */
export interface McapBoundedReadCancellation {
  readonly usage: ReadWorkUsage;
}

/**
 * Internal cancellation carrying partial work across inline and worker-backed
 * MCAP resource boundaries. It deliberately carries no continuation: a
 * partially completed admission group has no safe resume position.
 */
export class McapBoundedReadCancelledError extends Error {
  readonly usage: ReadWorkUsage;

  constructor(usage: ReadWorkUsage) {
    super("MCAP bounded read cancelled");
    this.name = "McapBoundedReadCancelledError";
    this.usage = { ...usage };
  }
}

/** Narrows an internal bounded-read cancellation with best-effort usage. */
export function isMcapBoundedReadCancelledError(
  error: unknown,
): error is McapBoundedReadCancelledError {
  return (
    error instanceof Error &&
    error.name === "McapBoundedReadCancelledError" &&
    "usage" in error &&
    isReadWorkUsage(error.usage)
  );
}

/** Zero known work for cancellation before a queued grant starts. */
export function emptyMcapBoundedReadUsage(): ReadWorkUsage {
  return {
    chunksOpened: 0,
    decompressedBytes: 0,
    decompressionCacheHits: 0,
    elapsedMs: 0,
    logicalSourceBytes: 0,
    logicalUncompressedBytes: 0,
    messagesDecoded: 0,
    transferredBytes: 0,
  };
}

function isReadWorkUsage(value: unknown): value is ReadWorkUsage {
  if (!value || typeof value !== "object") {
    return false;
  }
  return [
    "chunksOpened",
    "decompressedBytes",
    "decompressionCacheHits",
    "elapsedMs",
    "logicalSourceBytes",
    "logicalUncompressedBytes",
    "messagesDecoded",
    "transferredBytes",
  ].every(
    (key) =>
      key in value &&
      typeof (value as Record<string, unknown>)[key] === "number",
  );
}
