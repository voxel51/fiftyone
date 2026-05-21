import {
  createMcapTimelineTicks,
  DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
} from "../timeline";
import type { McapTimelineRange } from "../types";

export interface McapTimelineIndex {
  readonly ticks: readonly bigint[];
  readonly durationSec: number;
  readonly startTimeNs: bigint;
  secToNs(timeSec: number): bigint;
  nearestTick(timeSec: number): bigint | undefined;
}

export function createMcapTimelineIndex(
  range: McapTimelineRange
): McapTimelineIndex {
  const startTimeNs = range.startTimeNs;
  const durationSec =
    Number(range.endTimeNs - range.startTimeNs) / 1_000_000_000;
  const ticks = createMcapTimelineTicks(range, {
    tickRateHz: DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
  });

  function secToNs(timeSec: number): bigint {
    return startTimeNs + BigInt(Math.round(timeSec * 1_000_000_000));
  }

  function nearestTick(timeSec: number): bigint | undefined {
    if (ticks.length === 0) return undefined;
    const timeNs = secToNs(timeSec);
    let lo = 0;
    let hi = ticks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((ticks[mid] as bigint) < timeNs) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return ticks[0];
    if (lo >= ticks.length) return ticks[ticks.length - 1];
    const before = ticks[lo - 1] as bigint;
    const after = ticks[lo] as bigint;
    return timeNs - before <= after - timeNs ? before : after;
  }

  return { ticks, durationSec, startTimeNs, secToNs, nearestTick };
}
