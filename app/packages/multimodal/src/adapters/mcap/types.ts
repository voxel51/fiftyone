import type { ByteSourceDescriptor } from "../../query/bytes";
import type { DecodeResult } from "../../query/decode";
import type { PlaybackSyncMode, StreamInventory } from "../../schemas/v1";
import type { McapFrameTransformSet } from "./frame-transform-types";
import type { McapLaneTransportSnapshot } from "./worker/transport-meter";

/**
 * MCAP timeline selected as the playback clock/time track.
 */
export const MCAP_ACTIVE_TIMELINE = Object.freeze({
  LOG: "log",
} as const);

/**
 * Supported MCAP timeline used to derive playback synchronization time.
 */
export type McapActiveTimeline =
  (typeof MCAP_ACTIVE_TIMELINE)[keyof typeof MCAP_ACTIVE_TIMELINE];

/**
 * Stream-local playback sync policy. The mode comes from playback.proto; the
 * controller/UI owns choosing it per stream.
 */
export interface McapStreamSyncPolicy {
  /**
   * Maximum number of messages to select for the stream in one window.
   */
  readonly limit?: number;

  /**
   * Selection strategy used to match stream messages to the playback time.
   */
  readonly mode?: PlaybackSyncMode;

  /**
   * Inclusive tolerance after the playback time for modes that support it.
   */
  readonly toleranceAfterNs?: bigint;

  /**
   * Inclusive tolerance before the playback time for modes that support it.
   */
  readonly toleranceBeforeNs?: bigint;
}

/**
 * Per-topic playback sync policy map keyed by MCAP topic.
 */
export type McapStreamSyncPolicies = Readonly<
  Record<string, McapStreamSyncPolicy>
>;

/**
 * Sync policy after defaults have been resolved into concrete time bounds.
 */
export interface McapResolvedStreamSyncPolicy {
  /**
   * Inclusive end bound used for message selection.
   */
  readonly endTimeNs: bigint;

  /**
   * Concrete maximum number of messages selected for the stream.
   */
  readonly limit: number;

  /**
   * Concrete playback sync mode after default/unspecified handling.
   */
  readonly mode: PlaybackSyncMode;

  /**
   * Inclusive start bound used for message selection. Undefined means
   * unbounded lookback: selection may fall back to the newest message
   * at or before the playback time anywhere earlier in the file.
   */
  readonly startTimeNs?: bigint;
}

/**
 * Request for decoding an MCAP message window.
 */
export interface McapReadDecodedMessagesRequest {
  /**
   * Optional inclusive upper time bound in the active timeline.
   */
  readonly endTimeNs?: bigint;

  /**
   * Maximum number of decoded messages to yield.
   */
  readonly limit?: number;

  /**
   * MCAP source to read through the shared byte query layer.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * Optional inclusive lower time bound in the active timeline.
   */
  readonly startTimeNs?: bigint;

  /**
   * Timeline used as playback synchronization time; defaults to MCAP log time.
   */
  readonly activeTimeline?: McapActiveTimeline;

  /**
   * Optional MCAP topics to include. Undefined means all topics.
   */
  readonly topics?: readonly string[];
}

/**
 * Request for the playable time range of an MCAP timeline.
 */
export interface McapReadTimelineRangeRequest {
  /**
   * Timeline used for the returned range; defaults to MCAP log time.
   */
  readonly activeTimeline?: McapActiveTimeline;

  /**
   * MCAP source to inspect for timeline bounds.
   */
  readonly source: ByteSourceDescriptor;
}

/**
 * Request for reading topic inventory from an MCAP summary.
 */
export interface McapReadTopicsRequest {
  /**
   * MCAP source to inspect for summary channel metadata.
   */
  readonly source: ByteSourceDescriptor;
}

/**
 * Request for per-topic first/last message times from MCAP summary indexes.
 */
export interface McapReadTopicTimeBoundsRequest {
  /**
   * Timeline used for the returned bounds; defaults to MCAP log time.
   */
  readonly activeTimeline?: McapActiveTimeline;

  /**
   * MCAP source to inspect for message-index bounds.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * MCAP topics to resolve bounds for.
   */
  readonly topics: readonly string[];
}

/**
 * First/last message times for one topic. Null bounds mean the topic
 * has no indexed messages (or the file carries no usable indexes).
 */
export interface McapTopicTimeBounds {
  readonly topic: string;
  readonly firstMessageTimeNs: bigint | null;
  readonly lastMessageTimeNs: bigint | null;
}

/**
 * Request for frame transforms needed before a 3D panel can render.
 */
export interface McapReadFrameTransformBootstrapRequest {
  /**
   * MCAP source to inspect for eager transform messages.
   */
  readonly source: ByteSourceDescriptor;
}

/**
 * Request for dynamic frame transforms in a playback timeline window.
 */
export interface McapReadFrameTransformWindowRequest {
  /**
   * Timeline used to interpret request bounds; defaults to MCAP log time.
   */
  readonly activeTimeline?: McapActiveTimeline;

  /**
   * Inclusive upper timeline bound for dynamic transform messages.
   */
  readonly endTimeNs: bigint;

  /**
   * MCAP source to inspect for dynamic transform messages.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * Inclusive lower timeline bound for dynamic transform messages.
   */
  readonly startTimeNs: bigint;
}

/**
 * Playable time range for one MCAP timeline.
 */
export interface McapTimelineRange {
  /**
   * Timeline used for the returned range.
   */
  readonly activeTimeline: McapActiveTimeline;

  /**
   * Inclusive upper timeline bound.
   */
  readonly endTimeNs: bigint;

  /**
   * Inclusive lower timeline bound.
   */
  readonly startTimeNs: bigint;
}

/**
 * Request for a playback-oriented synchronized message window.
 */
export interface McapReadSynchronizedMessagesRequest {
  /**
   * Playback timeline time around which per-topic messages are selected.
   */
  readonly timeNs: bigint;

  /**
   * Fallback sync policy for topics without an explicit stream policy.
   */
  readonly defaultStreamPolicy?: McapStreamSyncPolicy;

  /**
   * MCAP source to read through the shared byte query layer.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * Topic-specific sync policies keyed by MCAP topic.
   */
  readonly streamPolicies?: McapStreamSyncPolicies;

  /**
   * Timeline used as playback synchronization time; defaults to MCAP log time.
   */
  readonly activeTimeline?: McapActiveTimeline;

  /**
   * MCAP topics to include in the synchronized window.
   */
  readonly topics: readonly string[];
}

/**
 * Batch request for playback prefetchers that need multiple synchronized
 * windows from the same source and topic set.
 */
export interface McapReadSynchronizedMessageBatchRequest extends Omit<
  McapReadSynchronizedMessagesRequest,
  "timeNs"
> {
  /**
   * Optional caller-owned id used only for correlating debug instrumentation
   * across stream fetches, worker attribution, and bandwidth samples.
   */
  readonly mcapDataRequestId?: string;

  /**
   * Playback times to resolve against the same source/topic/policy request.
   */
  readonly timeNs: readonly bigint[];
}

/**
 * Scheduling priority for resource reads where callers know whether the work
 * is immediately user-visible or opportunistic.
 */
export type McapResourceReadPriority = "current" | "idle" | "playback";

export interface McapResourceReadOptions {
  readonly priority?: McapResourceReadPriority;
}

/**
 * Decoded MCAP message with playback identity and decoder output.
 */
export interface McapDecodedMessage {
  /**
   * Numeric MCAP channel id that produced this message.
   */
  readonly channelId: number;

  /**
   * Decoder output for the message payload.
   */
  readonly decoded: DecodeResult;

  /**
   * Encoded MCAP message payload size before adapter decoding.
   */
  readonly encodedPayloadBytes?: number;

  /**
   * MCAP message log time.
   */
  readonly logTimeNs: bigint;

  /**
   * MCAP message publish time.
   */
  readonly publishTimeNs: bigint;

  /**
   * MCAP message sequence number.
   */
  readonly sequence: number;

  /**
   * Timeline time used by playback ordering and synchronization.
   */
  readonly timelineTimeNs: bigint;

  /**
   * Timeline used to compute timelineTimeNs.
   */
  readonly activeTimeline: McapActiveTimeline;

  /**
   * MCAP topic for the message channel.
   */
  readonly topic: string;
}

/**
 * Synchronized MCAP playback window grouped by topic.
 */
export interface McapSynchronizedMessageWindow {
  /**
   * Playback timeline time this window was requested around.
   */
  readonly timeNs: bigint;

  /**
   * Inclusive upper bound covered by the resolved stream policies.
   */
  readonly endTimeNs: bigint;

  /**
   * Selected decoded messages across all requested topics, ordered by timeline time.
   */
  readonly messages: readonly McapDecodedMessage[];

  /**
   * Selected decoded messages grouped by requested topic.
   */
  readonly messagesByTopic: Readonly<
    Record<string, readonly McapDecodedMessage[]>
  >;

  /**
   * Inclusive lower bound covered by the resolved stream policies.
   */
  readonly startTimeNs: bigint;

  /**
   * Concrete stream policies used to construct this window.
   */
  readonly streamPolicies: Readonly<
    Record<string, McapResolvedStreamSyncPolicy>
  >;

  /**
   * Timeline used to compute message synchronization times in this window.
   */
  readonly activeTimeline: McapActiveTimeline;
}

/**
 * MCAP-specific resource client.
 */
export interface McapResourceClient {
  /**
   * Releases adapter-owned caches/readers/workers.
   */
  dispose(): void;

  /**
   * Cancels queued and in-flight speculative idle-lane reads (background
   * lookahead batches, transform runway windows). Called on seek so a
   * constrained link goes to foreground catch-up instead of finishing
   * transfers nobody needs. Cancelled reads reject with the canonical
   * cancelled error; consumers treat those as benign.
   */
  cancelIdleReads?(): void;

  /**
   * Subscribes to cumulative network-transport snapshots from worker-backed
   * read lanes. Inline clients (tests, workers themselves) omit this;
   * network-health consumers must treat it as optional.
   */
  subscribeTransport?(
    listener: (sample: McapLaneTransportSnapshot) => void,
  ): () => void;

  /**
   * Streams decoded messages for the requested topics and time bounds.
   */
  readDecodedMessages(
    request: McapReadDecodedMessagesRequest,
  ): AsyncGenerator<McapDecodedMessage, void, void>;

  /**
   * Returns the playable time range for the active timeline.
   */
  readTimelineRange(
    request: McapReadTimelineRangeRequest,
  ): Promise<McapTimelineRange>;

  /**
   * Reads stream inventory entries from MCAP summary channel metadata.
   */
  readTopics(
    request: McapReadTopicsRequest,
  ): Promise<readonly StreamInventory[]>;

  /**
   * Reads per-topic first/last message times from summary indexes.
   * Auxiliary data: soft-fails to null bounds when indexes are absent.
   */
  readTopicTimeBounds(
    request: McapReadTopicTimeBoundsRequest,
  ): Promise<readonly McapTopicTimeBounds[]>;

  /**
   * Reads eager frame transforms needed for initial 3D placement.
   */
  readFrameTransformBootstrap(
    request: McapReadFrameTransformBootstrapRequest,
  ): Promise<McapFrameTransformSet>;

  /**
   * Reads dynamic frame transforms in a playback timeline window.
   */
  readFrameTransformWindow(
    request: McapReadFrameTransformWindowRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapFrameTransformSet>;

  /**
   * Reads one synchronized decoded message window around a playback time.
   */
  readSynchronizedMessages(
    request: McapReadSynchronizedMessagesRequest,
  ): Promise<McapSynchronizedMessageWindow>;

  /**
   * Reads multiple synchronized windows for playback lookahead/prefetch.
   */
  readSynchronizedMessageBatch(
    request: McapReadSynchronizedMessageBatchRequest,
    options?: McapResourceReadOptions,
  ): Promise<readonly McapSynchronizedMessageWindow[]>;
}
