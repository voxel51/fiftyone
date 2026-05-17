import type { McapTypes } from "@mcap/core";
import type {
  McapIndexedMessageTime,
  McapReadIndexedMessageTimesRequest,
} from "./reader";
import { MCAP_ACTIVE_TIMELINE, type McapActiveTimeline } from "./types";

type TypedMcapRecords = McapTypes.TypedMcapRecords;

/**
 * Default playback timeline tick cadence used to sample MCAP ranges.
 */
export const DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ = 30;

/**
 * Upper bound for generated MCAP timeline ticks.
 */
export const DEFAULT_MCAP_TIMELINE_MAX_TICKS = 20_000;

const NANOSECONDS_PER_SECOND = 1_000_000_000;

/**
 * Options for generating sampled MCAP timeline ticks.
 */
export interface McapTimelineTickOptions {
  readonly maxTicks?: number;
  readonly tickRateHz?: number;
}

/**
 * Minimal MCAP timeline range used by tick generation.
 */
export interface McapTimelineRangeLike {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}

/**
 * MCAP timeline strategy that owns how adapter playback time maps to MCAP data.
 */
export interface McapTimelineStrategy {
  /**
   * Public timeline identifier carried through MCAP resource responses.
   */
  readonly id: McapActiveTimeline;

  /**
   * Stable suffix included in decoded-output cache keys for this timeline.
   */
  readonly cacheKeySuffix: string;

  /**
   * Decoder context timestamp key that represents the start of a time range.
   */
  readonly decodeTimeRangeStartKey: "logTime" | "publishTime";

  /**
   * Returns the chunk-level inclusive end time for this timeline.
   */
  chunkEndTimeNs(chunkIndex: TypedMcapRecords["ChunkIndex"]): bigint;

  /**
   * Returns the chunk-level inclusive start time for this timeline.
   */
  chunkStartTimeNs(chunkIndex: TypedMcapRecords["ChunkIndex"]): bigint;

  /**
   * Returns the timeline time for one indexed message entry, when supported.
   */
  indexedMessageTimeNs?(message: McapIndexedMessageTime): bigint;

  /**
   * Converts timeline bounds into a message-index timestamp read request.
   */
  indexedMessageTimesRequest?(bounds: {
    readonly endTimeNs?: bigint;
    readonly startTimeNs?: bigint;
    readonly topics?: readonly string[];
  }): McapReadIndexedMessageTimesRequest;

  /**
   * Converts timeline bounds into the native MCAP message read range.
   */
  messageReadRange(bounds: {
    readonly endTimeNs?: bigint;
    readonly startTimeNs?: bigint;
  }): {
    readonly endTime?: bigint;
    readonly startTime?: bigint;
  };

  /**
   * Returns the timeline time for one decoded MCAP message.
   */
  messageTimeNs(message: TypedMcapRecords["Message"]): bigint;
}

const MCAP_LOG_TIMELINE_STRATEGY: McapTimelineStrategy = {
  cacheKeySuffix: "activeTimeline=log",
  chunkEndTimeNs: (chunkIndex) => chunkIndex.messageEndTime,
  chunkStartTimeNs: (chunkIndex) => chunkIndex.messageStartTime,
  decodeTimeRangeStartKey: "logTime",
  id: MCAP_ACTIVE_TIMELINE.LOG,
  indexedMessageTimeNs: (message) => message.logTimeNs,
  indexedMessageTimesRequest: ({ endTimeNs, startTimeNs, topics }) => ({
    endTimeNs,
    startTimeNs,
    topics,
  }),
  messageReadRange: ({ endTimeNs, startTimeNs }) => ({
    endTime: endTimeNs,
    startTime: startTimeNs,
  }),
  messageTimeNs: (message) => message.logTime,
};

/**
 * Normalizes and validates the active MCAP timeline id.
 */
export function resolveMcapActiveTimeline(
  activeTimeline: string | undefined
): McapActiveTimeline {
  return resolveMcapTimelineStrategy(activeTimeline).id;
}

/**
 * Resolves the active MCAP timeline strategy.
 */
export function resolveMcapTimelineStrategy(
  activeTimeline: string | undefined
): McapTimelineStrategy {
  if (
    activeTimeline === undefined ||
    activeTimeline === MCAP_ACTIVE_TIMELINE.LOG
  ) {
    return MCAP_LOG_TIMELINE_STRATEGY;
  }

  throw new Error(`Unsupported MCAP active timeline '${activeTimeline}'`);
}

/**
 * Generates sampled playback timestamps across one MCAP timeline range.
 */
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

  const stepNs = BigInt(
    Math.max(1, Math.round(NANOSECONDS_PER_SECOND / tickRateHz))
  );
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
