import type { McapTypes } from "@mcap/core";
import { maxBigInt, minBigInt } from "../../synchronization/policy";
import type { McapIndexedReaderLike } from "../../reader/index";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapByteTimelinePoint,
  McapTimelineRange,
} from "../../contracts/index";

/**
 * Resolves the playable MCAP timeline bounds from indexed chunk metadata.
 */
export function mcapTimelineRangeFromReader(
  reader: McapIndexedReaderLike,
  timeline: McapTimelineStrategy,
): McapTimelineRange {
  if (reader.chunkIndexes.length === 0) {
    throw new Error("MCAP log timeline has no indexed chunks");
  }

  const chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][] =
    reader.chunkIndexes;

  return {
    activeTimeline: timeline.id,
    byteTimeline: mcapByteTimelineFromChunkIndexes(chunkIndexes, timeline),
    endTimeNs: maxBigInt(
      chunkIndexes.map((chunkIndex) => timeline.chunkEndTimeNs(chunkIndex)),
    ),
    startTimeNs: minBigInt(
      chunkIndexes.map((chunkIndex) => timeline.chunkStartTimeNs(chunkIndex)),
    ),
  };
}

/**
 * Cumulative compressed chunk bytes in chunk-end-time order. Chunk bodies
 * dominate what playback fetches (message indexes and headers ride inside
 * the same block fills), so `chunkLength` alone is an honest byte cost for
 * "play through this chunk's window".
 */
function mcapByteTimelineFromChunkIndexes(
  chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][],
  timeline: McapTimelineStrategy,
): readonly McapByteTimelinePoint[] {
  const ordered = [...chunkIndexes].sort((a, b) => {
    const aEnd = timeline.chunkEndTimeNs(a);
    const bEnd = timeline.chunkEndTimeNs(b);
    return aEnd < bEnd ? -1 : aEnd > bEnd ? 1 : 0;
  });

  let cumulativeCompressedBytes = 0;
  return ordered.map((chunkIndex) => {
    cumulativeCompressedBytes += Number(chunkIndex.chunkLength);
    return {
      cumulativeCompressedBytes,
      endTimeNs: timeline.chunkEndTimeNs(chunkIndex),
      startOffsetBytes: chunkIndex.chunkStartOffset,
    };
  });
}
