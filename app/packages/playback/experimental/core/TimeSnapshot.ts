import type { TimeInt, TimeReal, TimelineName, TimeSnapshot } from "../types";

/** Monotonic counter shared across all snapshots. */
let _nextFrameId = 0;

/**
 * Create a frozen TimeSnapshot with a monotonically increasing frameId.
 */
export function createSnapshot(
  timeline: TimelineName,
  timeInt: TimeInt,
  timeReal: TimeReal
): TimeSnapshot {
  return Object.freeze({
    timeline,
    timeInt,
    timeReal,
    frameId: ++_nextFrameId,
  });
}

/**
 * Create an initial snapshot for a timeline starting at the given time.
 */
export function createInitialSnapshot(
  timeline: TimelineName,
  startTime: TimeInt
): TimeSnapshot {
  return createSnapshot(timeline, startTime, startTime);
}
