import type { TimeWindow } from "../ir";

const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const NANOSECONDS_PER_SECOND_NUMBER = 1_000_000_000;
/** Default presentation sampling cadence for continuous episode timelines. */
export const DEFAULT_TIMELINE_TICK_RATE_HZ = 30;

/** Precision-safe tick index over one inclusive episode time window. */
export interface TimelineIndex {
  readonly durationSec: number;
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
  readonly stepNs: bigint;
  /** Requested presentation cadence used to derive `stepNs`. */
  readonly tickRateHz: number;
  readonly tickCount: number;
  indexAtOrAfter(timeNs: bigint): number;
  indexOfTick(tickNs: bigint): number | undefined;
  nsToSec(timeNs: bigint): number;
  secToNs(timeSec: number): bigint;
  tickAt(index: number): bigint | undefined;
  nearestTick(timeSec: number): bigint | undefined;
}

/** Creates a precision-safe runtime index for an inclusive time window. */
export function createTimelineIndex(
  range: TimeWindow,
  tickRateHz = DEFAULT_TIMELINE_TICK_RATE_HZ,
): TimelineIndex {
  if (!Number.isFinite(tickRateHz) || tickRateHz <= 0) {
    throw new Error("Timeline tick rate must be finite and greater than zero");
  }
  const timelineStepNs = BigInt(
    Math.max(1, Math.round(NANOSECONDS_PER_SECOND_NUMBER / tickRateHz)),
  );
  const startTimeNs = range.startNs;
  if (range.endNs < range.startNs) {
    throw new Error("Timeline range end cannot be before start");
  }

  // Split the bigint nanosecond delta into whole seconds + sub-second
  // remainder before casting to `number` — keeps full precision even for
  // multi-day recordings where the raw delta exceeds `Number.MAX_SAFE_INTEGER`.
  const durationNs = range.endNs - range.startNs;
  const durationSec = nanosecondsDeltaToSeconds(durationNs);
  const tickCountBig = durationNs / timelineStepNs + 1n;
  if (tickCountBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Timeline tick count exceeds safe integer range");
  }
  const tickCount = Number(tickCountBig);

  function secToNs(timeSec: number): bigint {
    if (!Number.isFinite(timeSec)) {
      throw new Error("Timeline time in seconds must be finite");
    }
    const wholeSeconds = Math.trunc(timeSec);
    const fractionalSeconds = timeSec - wholeSeconds;
    return (
      startTimeNs +
      BigInt(wholeSeconds) * NANOSECONDS_PER_SECOND +
      BigInt(Math.round(fractionalSeconds * NANOSECONDS_PER_SECOND_NUMBER))
    );
  }

  function nsToSec(timeNs: bigint): number {
    return nanosecondsDeltaToSeconds(timeNs - startTimeNs);
  }

  function tickAt(index: number): bigint | undefined {
    if (!Number.isSafeInteger(index) || index < 0 || index >= tickCount) {
      return undefined;
    }
    return startTimeNs + BigInt(index) * timelineStepNs;
  }

  function indexAtOrAfter(timeNs: bigint): number {
    if (timeNs <= startTimeNs) return 0;
    const deltaNs = timeNs - startTimeNs;
    const indexBig = (deltaNs + timelineStepNs - 1n) / timelineStepNs;
    // `tickCount` is an intentional one-past-the-end sentinel. This mirrors
    // lower-bound indexing and lets callers distinguish clamping from absence.
    if (indexBig >= tickCountBig) return tickCount;
    return Number(indexBig);
  }

  function indexOfTick(tickNs: bigint): number | undefined {
    if (tickNs < startTimeNs) return undefined;
    const deltaNs = tickNs - startTimeNs;
    if (deltaNs % timelineStepNs !== 0n) return undefined;
    const indexBig = deltaNs / timelineStepNs;
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
    endTimeNs: range.endNs,
    indexAtOrAfter,
    indexOfTick,
    nsToSec,
    startTimeNs,
    stepNs: timelineStepNs,
    tickAt,
    tickRateHz,
    tickCount,
    secToNs,
    nearestTick,
  };
}

function nanosecondsDeltaToSeconds(deltaNs: bigint): number {
  return (
    Number(deltaNs / NANOSECONDS_PER_SECOND) +
    Number(deltaNs % NANOSECONDS_PER_SECOND) / NANOSECONDS_PER_SECOND_NUMBER
  );
}
