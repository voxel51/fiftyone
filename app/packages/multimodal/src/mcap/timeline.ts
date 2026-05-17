import { MCAP_ACTIVE_TIMELINE, type McapActiveTimeline } from "./types";

export const DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ = 30;
export const DEFAULT_MCAP_TIMELINE_MAX_TICKS = 20_000;

export interface McapTimelineTickOptions {
  readonly maxTicks?: number;
  readonly tickRateHz?: number;
}

export interface McapTimelineRangeLike {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}

export function resolveMcapActiveTimeline(
  activeTimeline: string | undefined
): McapActiveTimeline {
  if (
    activeTimeline === undefined ||
    activeTimeline === MCAP_ACTIVE_TIMELINE.LOG
  ) {
    return MCAP_ACTIVE_TIMELINE.LOG;
  }

  throw new Error(`Unsupported MCAP active timeline '${activeTimeline}'`);
}

export function createMcapTimelineTicks(
  range: McapTimelineRangeLike,
  options: McapTimelineTickOptions = {}
): readonly bigint[] {
  const tickRateHz = options.tickRateHz ?? DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ;
  if (!Number.isFinite(tickRateHz) || tickRateHz <= 0) {
    throw new Error("MCAP timeline tick rate must be a positive finite number");
  }

  const maxTicks = options.maxTicks ?? DEFAULT_MCAP_TIMELINE_MAX_TICKS;
  if (!Number.isSafeInteger(maxTicks) || maxTicks < 1) {
    throw new Error("MCAP timeline max tick count must be a positive integer");
  }

  if (range.endTimeNs < range.startTimeNs) {
    throw new Error("MCAP timeline range end cannot be before start");
  }

  const stepNs = BigInt(Math.max(1, Math.round(1_000_000_000 / tickRateHz)));
  const ticks: bigint[] = [];

  for (
    let timeNs = range.startTimeNs;
    timeNs <= range.endTimeNs;
    timeNs += stepNs
  ) {
    ticks.push(timeNs);
    if (ticks.length >= maxTicks) {
      break;
    }
  }

  return ticks;
}
