import type { McapTypes } from "@mcap/core";
import { maxBigInt, minBigInt } from "../sync";
import type { McapIndexedReaderLike } from "../reader";
import type { McapTimelineStrategy } from "../timeline";
import type { McapTimelineRange } from "../types";

/**
 * Resolves the playable MCAP timeline bounds from indexed chunk metadata.
 */
export function mcapTimelineRangeFromReader(
  reader: McapIndexedReaderLike,
  timeline: McapTimelineStrategy
): McapTimelineRange {
  if (reader.chunkIndexes.length === 0) {
    throw new Error("MCAP log timeline has no indexed chunks");
  }

  const chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][] =
    reader.chunkIndexes;

  return {
    activeTimeline: timeline.id,
    endTimeNs: maxBigInt(
      chunkIndexes.map((chunkIndex) => timeline.chunkEndTimeNs(chunkIndex))
    ),
    startTimeNs: minBigInt(
      chunkIndexes.map((chunkIndex) => timeline.chunkStartTimeNs(chunkIndex))
    ),
  };
}
