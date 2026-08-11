import type { McapChunkIndex } from "./types";

/** Byte range covering all message-index records associated with one MCAP chunk. */
export interface McapChunkMessageIndexRange {
  readonly length: bigint;
  readonly offset: bigint;
}

/**
 * Full message-index byte region for one chunk: every channel's index records
 * live contiguously in `messageIndexLength` bytes after the earliest offset.
 */
export function chunkMessageIndexRange(
  chunkIndex: McapChunkIndex,
): McapChunkMessageIndexRange | null {
  if (
    chunkIndex.messageIndexOffsets.size === 0 ||
    chunkIndex.messageIndexLength === 0n
  ) {
    return null;
  }

  let offset: bigint | undefined;
  for (const candidate of chunkIndex.messageIndexOffsets.values()) {
    if (offset === undefined || candidate < offset) {
      offset = candidate;
    }
  }
  if (offset === undefined) {
    return null;
  }

  return {
    length: chunkIndex.messageIndexLength,
    offset,
  };
}
