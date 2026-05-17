import { maxBigInt, minBigInt } from "./sync";
import type { McapActiveTimeline, McapTimelineRange } from "./types";
import type { McapIndexedReaderLike } from "./reader";

/**
 * Resolves the playable MCAP timeline bounds from indexed chunk metadata.
 */
export function mcapTimelineRangeFromReader(
  reader: McapIndexedReaderLike,
  activeTimeline: McapActiveTimeline
): McapTimelineRange {
  if (reader.chunkIndexes.length === 0) {
    throw new Error("MCAP log timeline has no indexed chunks");
  }

  return {
    activeTimeline,
    endTimeNs: maxBigInt(
      reader.chunkIndexes.map((chunkIndex) => chunkIndex.messageEndTime)
    ),
    startTimeNs: minBigInt(
      reader.chunkIndexes.map((chunkIndex) => chunkIndex.messageStartTime)
    ),
  };
}
