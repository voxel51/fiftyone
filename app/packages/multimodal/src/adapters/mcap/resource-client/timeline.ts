import type { McapTypes } from "@mcap/core";
import type {
  McapIndexedMessageTime,
  McapReadIndexedMessageTimesRequest,
} from "../reader/index";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapActiveTimeline,
} from "../contracts/index";

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
  chunkEndTimeNs(chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"]): bigint;

  /**
   * Returns the chunk-level inclusive start time for this timeline.
   */
  chunkStartTimeNs(
    chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"],
  ): bigint;

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
  messageTimeNs(message: McapTypes.TypedMcapRecords["Message"]): bigint;
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
  activeTimeline: string | undefined,
): McapActiveTimeline {
  return resolveMcapTimelineStrategy(activeTimeline).id;
}

/**
 * Resolves the active MCAP timeline strategy.
 */
export function resolveMcapTimelineStrategy(
  activeTimeline: string | undefined,
): McapTimelineStrategy {
  if (
    activeTimeline === undefined ||
    activeTimeline === MCAP_ACTIVE_TIMELINE.LOG
  ) {
    return MCAP_LOG_TIMELINE_STRATEGY;
  }

  throw new Error(`Unsupported MCAP active timeline '${activeTimeline}'`);
}
