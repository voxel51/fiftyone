import type { ByteClient, ByteSourceDescriptor } from "../../query/bytes";
import type { ByteTimelinePoint } from "../../ir";

/**
 * Deliberate paused-idle banking: while the user looks at a paused remote
 * recording, walk its remaining bytes through the shared byte-cache stack
 * so a later play press (or replay) runs from disk instead of the wire.
 *
 * Banking used to happen only as a side effect of the pose-trajectory
 * full-history scan, which recordings without a pose stream never get.
 * This module makes it a first-class pass: it reads the exact block grid
 * the demand path fills (same zoned sizes, same lock and persistent-cache
 * shapes), so every banked block is a future demand fill's disk hit and
 * already-banked regions cost one cache probe each.
 */

/**
 * File offset of the first chunk still ahead of `timeNs` — banking starts
 * here so the bytes the playhead needs next land first. Past the last
 * chunk, banking has nothing forward and starts at the final chunk.
 */
export function episodeBankingStartOffset(
  byteTimeline: readonly ByteTimelinePoint[],
  timeNs: bigint,
): bigint {
  for (const point of byteTimeline) {
    if (point.endTimeNs > timeNs) {
      return point.startOffsetBytes;
    }
  }
  return byteTimeline[byteTimeline.length - 1]?.startOffsetBytes ?? 0n;
}

/**
 * Exclusive file offset where the chunk region ends: the final chunk's
 * start plus its own compressed length (recovered from the cumulative
 * curve). The header before the first chunk is covered by the wrap-around
 * region; the summary after the last chunk is already resident from init.
 */
export function episodeBankingEndOffset(
  byteTimeline: readonly ByteTimelinePoint[],
): bigint {
  const last = byteTimeline[byteTimeline.length - 1];
  if (!last) {
    return 0n;
  }
  const previousCumulative =
    byteTimeline[byteTimeline.length - 2]?.cumulativeCompressedBytes ?? 0;
  return (
    last.startOffsetBytes +
    BigInt(last.cumulativeCompressedBytes - previousCumulative)
  );
}

export interface EpisodeByteBankingPassOptions {
  /**
   * Byte client the pass reads through — a background-slot-class client
   * so banking can never occupy the reserved priority fill slot.
   */
  readonly bytes: ByteClient;

  /**
   * Grid sizing for one offset; must match the demand path's fill policy
   * (zoned remote blocks) or banked shapes would not dedupe with fills.
   */
  readonly blockSizeBytesFor: (offset: bigint) => number | undefined;

  /**
   * Exclusive upper bound of the region worth banking.
   */
  readonly endOffset: bigint;

  /**
   * Where to begin; the pass wraps to offset 0 and banks the skipped head
   * after reaching `endOffset`.
   */
  readonly fromOffset: bigint;

  /**
   * Called between blocks with cumulative banked bytes.
   */
  readonly onProgress?: (bankedBytes: bigint) => void;

  /**
   * Checked between blocks; truthy stops the pass before the next read.
   */
  readonly shouldStop: () => boolean;

  /**
   * Source to bank. Must carry resolved `sizeBytes` so the block grid
   * matches the worker lanes' fill grid exactly.
   */
  readonly source: ByteSourceDescriptor;
}

/**
 * Runs one banking pass: playhead-forward to the end of the content
 * region, then wrap-around from the file head. Resolves "stopped" when
 * `shouldStop` interrupted it, else "completed". Individual block-read
 * failures stop the pass quietly — banking is opportunistic and the
 * demand path owns retries.
 */
export async function runEpisodeByteBankingPass({
  blockSizeBytesFor,
  bytes,
  endOffset,
  fromOffset,
  onProgress,
  shouldStop,
  source,
}: EpisodeByteBankingPassOptions): Promise<"completed" | "failed" | "stopped"> {
  let bankedBytes = 0n;

  const bankRegion = async (
    regionStart: bigint,
    regionEnd: bigint,
  ): Promise<"completed" | "failed" | "stopped"> => {
    let cursor = regionStart;
    while (cursor < regionEnd) {
      if (shouldStop()) {
        return "stopped";
      }
      const blockSizeBytes = blockSizeBytesFor(cursor);
      if (
        blockSizeBytes === undefined ||
        !Number.isSafeInteger(blockSizeBytes) ||
        blockSizeBytes <= 0
      ) {
        return "failed";
      }
      const blockSize = BigInt(blockSizeBytes);
      // Align to the absolute block grid the demand path fills on, so
      // this read coalesces with (or short-circuits to) its cache entry;
      // partial region edges are block-widened by the byte client.
      const blockStart = (cursor / blockSize) * blockSize;
      const blockEnd = blockStart + blockSize;
      const readEnd = blockEnd < regionEnd ? blockEnd : regionEnd;
      try {
        const result = await bytes.readBytes({
          range: { length: readEnd - blockStart, offset: blockStart },
          source,
        });
        bankedBytes += result.range.length;
      } catch {
        return "failed";
      }
      onProgress?.(bankedBytes);
      cursor = blockEnd;
    }
    return "completed";
  };

  const forward = await bankRegion(fromOffset, endOffset);
  if (forward !== "completed") {
    return forward;
  }
  if (fromOffset === 0n) {
    return "completed";
  }
  return bankRegion(0n, fromOffset);
}
