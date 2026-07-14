import { DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ } from "../timeline";
import type { McapTimelineRange } from "../types";

const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const NANOSECONDS_PER_SECOND_NUMBER = 1_000_000_000;
const TIMELINE_STEP_NS = BigInt(
  Math.max(
    1,
    Math.round(
      NANOSECONDS_PER_SECOND_NUMBER / DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
    ),
  ),
);

export interface McapTimelineIndex {
  readonly durationSec: number;
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
  readonly stepNs: bigint;
  readonly tickCount: number;
  indexAtOrAfter(timeNs: bigint): number;
  indexOfTick(tickNs: bigint): number | undefined;
  nsToSec(timeNs: bigint): number;
  secToNs(timeSec: number): bigint;
  tickAt(index: number): bigint | undefined;
  nearestTick(timeSec: number): bigint | undefined;
}

export function createMcapTimelineIndex(
  range: McapTimelineRange,
): McapTimelineIndex {
  const startTimeNs = range.startTimeNs;
  // Split the bigint nanosecond delta into whole seconds + sub-second
  // remainder before casting to `number` — keeps full precision even for
  // multi-day recordings where the raw delta exceeds `Number.MAX_SAFE_INTEGER`.
  if (range.endTimeNs < range.startTimeNs) {
    throw new Error("MCAP timeline range end cannot be before start");
  }

  const durationNs = range.endTimeNs - range.startTimeNs;
  const durationSec =
    Number(durationNs / NANOSECONDS_PER_SECOND) +
    Number(durationNs % NANOSECONDS_PER_SECOND) / NANOSECONDS_PER_SECOND_NUMBER;
  const tickCountBig = durationNs / TIMELINE_STEP_NS + 1n;
  if (tickCountBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("MCAP timeline tick count exceeds safe integer range");
  }
  const tickCount = Number(tickCountBig);

  function secToNs(timeSec: number): bigint {
    return (
      startTimeNs + BigInt(Math.round(timeSec * NANOSECONDS_PER_SECOND_NUMBER))
    );
  }

  function nsToSec(timeNs: bigint): number {
    const deltaNs = timeNs - startTimeNs;
    return (
      Number(deltaNs / NANOSECONDS_PER_SECOND) +
      Number(deltaNs % NANOSECONDS_PER_SECOND) / NANOSECONDS_PER_SECOND_NUMBER
    );
  }

  function tickAt(index: number): bigint | undefined {
    if (!Number.isSafeInteger(index) || index < 0 || index >= tickCount) {
      return undefined;
    }
    return startTimeNs + BigInt(index) * TIMELINE_STEP_NS;
  }

  function indexAtOrAfter(timeNs: bigint): number {
    if (timeNs <= startTimeNs) return 0;
    const deltaNs = timeNs - startTimeNs;
    const indexBig = (deltaNs + TIMELINE_STEP_NS - 1n) / TIMELINE_STEP_NS;
    if (indexBig >= tickCountBig) return tickCount;
    return Number(indexBig);
  }

  function indexOfTick(tickNs: bigint): number | undefined {
    if (tickNs < startTimeNs) return undefined;
    const deltaNs = tickNs - startTimeNs;
    if (deltaNs % TIMELINE_STEP_NS !== 0n) return undefined;
    const indexBig = deltaNs / TIMELINE_STEP_NS;
    if (indexBig >= tickCountBig) return undefined;
    return Number(indexBig);
  }

  function nearestTick(timeSec: number): bigint | undefined {
    const timeNs = secToNs(timeSec);
    const firstTick = tickAt(0);
    if (firstTick === undefined) return undefined;
    if (timeNs <= firstTick) return firstTick;

    const lastTick = tickAt(tickCount - 1);
    if (lastTick === undefined) return undefined;
    if (timeNs >= lastTick) return lastTick;

    const index = indexAtOrAfter(timeNs);
    if (index <= 0) return firstTick;
    if (index >= tickCount) return lastTick;
    const before = tickAt(index - 1) as bigint;
    const after = tickAt(index) as bigint;
    return timeNs - before <= after - timeNs ? before : after;
  }

  return {
    durationSec,
    endTimeNs: range.endTimeNs,
    indexAtOrAfter,
    indexOfTick,
    nsToSec,
    startTimeNs,
    stepNs: TIMELINE_STEP_NS,
    tickAt,
    tickCount,
    secToNs,
    nearestTick,
  };
}
