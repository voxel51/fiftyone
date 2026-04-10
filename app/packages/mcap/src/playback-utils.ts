import type { BufferRange } from "@fiftyone/utilities";
import type { McapTimeRange } from "./types";

/** Default frontend MCAP buffer window size in nanoseconds. */
export const MCAP_BUFFER_WINDOW_SIZE_NS = 3_000_000_000;

/** Finds the nearest timestamp at or before the target timestamp. */
export function findNearestTimestampAtOrBefore(
  timestampsNs: number[],
  targetNs: number
): number | null {
  if (!timestampsNs.length) {
    return null;
  }

  let left = 0;
  let right = timestampsNs.length - 1;
  let matchIndex = -1;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const value = timestampsNs[middle];

    if (value <= targetNs) {
      matchIndex = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  return matchIndex >= 0 ? timestampsNs[matchIndex] : null;
}

/** Finds the nearest timestamp at or after the target timestamp. */
export function findNearestTimestampAtOrAfter(
  timestampsNs: number[],
  targetNs: number
): number | null {
  if (!timestampsNs.length) {
    return null;
  }

  let left = 0;
  let right = timestampsNs.length - 1;
  let matchIndex = -1;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const value = timestampsNs[middle];

    if (value >= targetNs) {
      matchIndex = middle;
      right = middle - 1;
    } else {
      left = middle + 1;
    }
  }

  return matchIndex >= 0 ? timestampsNs[matchIndex] : null;
}

/** Maps a 1-indexed playback frame range to its shared timeline timestamps. */
export function getTimelineTimestampRangeForFrames(
  timestampsNs: number[],
  frameRange: BufferRange
): McapTimeRange | null {
  const startTimestamp = timestampsNs[frameRange[0] - 1];
  const endTimestamp = timestampsNs[frameRange[1] - 1];

  if (startTimestamp === undefined || endTimestamp === undefined) {
    return null;
  }

  return {
    startNs: Math.min(startTimestamp, endTimestamp),
    endNs: Math.max(startTimestamp, endTimestamp),
  };
}

/** Infers a reasonable playback frame rate from shared MCAP timestamps. */
export function inferMcapTimelineFrameRate(timestampsNs: number[]): number {
  if (timestampsNs.length < 2) {
    return 1;
  }

  const durationNs = timestampsNs[timestampsNs.length - 1] - timestampsNs[0];
  if (durationNs <= 0) {
    return 1;
  }

  const averageDeltaNs = durationNs / Math.max(timestampsNs.length - 1, 1);
  const estimatedFrameRate = 1_000_000_000 / averageDeltaNs;

  return Math.max(1, Math.min(30, Number(estimatedFrameRate.toFixed(2))));
}

/** Builds fixed-size MCAP fetch windows relative to the scene time range. */
export function getMcapWindowsForRange(
  sceneRange: McapTimeRange,
  requestedRange: McapTimeRange,
  windowSizeNs = MCAP_BUFFER_WINDOW_SIZE_NS
): McapTimeRange[] {
  if (requestedRange.endNs < requestedRange.startNs) {
    return [];
  }

  const boundedStart = Math.max(sceneRange.startNs, requestedRange.startNs);
  const boundedEnd = Math.min(sceneRange.endNs, requestedRange.endNs);

  if (boundedEnd < boundedStart) {
    return [];
  }

  const startIndex = Math.floor(
    (boundedStart - sceneRange.startNs) / windowSizeNs
  );
  const endIndex = Math.floor((boundedEnd - sceneRange.startNs) / windowSizeNs);
  const windows: McapTimeRange[] = [];

  for (let index = startIndex; index <= endIndex; index += 1) {
    const startNs = sceneRange.startNs + index * windowSizeNs;
    const endNs = Math.min(sceneRange.endNs, startNs + windowSizeNs - 1);
    windows.push({ startNs, endNs });
  }

  return windows;
}
