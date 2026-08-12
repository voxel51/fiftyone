import type { ReadWorkUsage } from "./session";

/** Creates a fresh zero-valued read-work usage record. */
export function emptyReadWorkUsage(): ReadWorkUsage {
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
