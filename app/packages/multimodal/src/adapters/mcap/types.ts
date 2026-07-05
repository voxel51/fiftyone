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
 * Request for enumerating plottable numeric leaf fields per topic.
 */
export interface McapEnumerateNumericFieldsRequest {
  /**
   * MCAP source to inspect for channel schemas.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * Optional MCAP topics to include. Undefined means all topics.
   */
  readonly topics?: readonly string[];
}

/**
 * One numeric leaf field of a topic's message schema, addressed by a
 * dotted path (e.g. `twist.linear.x`).
 */
export interface McapNumericFieldDescriptor {
  readonly path: string;

  /**
   * Schema-level value type ("double", "int64", "bool", "enum", …).
   * Informational: 64-bit integer types lose precision beyond 2^53
   * when projected to chart values.
   */
  readonly valueType: string;
}

/**
 * Plottable numeric fields for one topic. `encoding: "unsupported"`
 * marks topics whose message encoding has no numeric extraction path
 * yet (e.g. cbor, ros1) — surfaced so gaps stay legible instead of
 * silently absent.
 */
export interface McapTopicNumericFields {
  readonly topic: string;
  readonly encoding: "protobuf" | "json" | "unsupported";

  /**
   * True when fields were derived by sampling decoded messages (JSON
   * channels carry no walkable schema); fields appearing only later in
   * the recording may be missing.
   */
  readonly sampled?: boolean;
  readonly fields: readonly McapNumericFieldDescriptor[];
}

/**
 * Request for a packed numeric time series of one topic's field paths.
 */
export interface McapReadNumericSeriesRequest {
  /**
   * Timeline used to interpret request bounds; defaults to MCAP log time.
   */
  readonly activeTimeline?: McapActiveTimeline;

  /**
   * Optional inclusive upper time bound in the active timeline.
   */
  readonly endTimeNs?: bigint;

  /**
   * Dotted numeric leaf paths to project from each decoded message.
   */
  readonly fieldPaths: readonly string[];

  /**
   * Post-decimation cap per field. Defaults to
   * `DEFAULT_NUMERIC_SERIES_MAX_POINTS`.
   */
  readonly maxPointsPerField?: number;

  /**
   * MCAP source to read through the shared byte query layer.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * Optional inclusive lower time bound in the active timeline.
   */
  readonly startTimeNs?: bigint;

  /**
   * MCAP topic to extract from.
   */
  readonly topic: string;
}

/**
 * Packed series for one requested field path. Parallel arrays; times
 * are seconds relative to the result's `baseTimeNs`. `NaN` values mark
 * messages where the field was missing or non-numeric so charts can
 * render gaps.
 */
export interface McapNumericSeriesField {
  readonly path: string;
  readonly timesSec: Float64Array;
  readonly values: Float64Array;
}

/**
 * Numeric series extraction result for one topic.
 */
export interface McapNumericSeriesResult {
  /**
   * Timeline range start the per-field times are relative to.
   */
  readonly baseTimeNs: bigint;
  readonly fields: readonly McapNumericSeriesField[];

  /**
   * Messages decoded (post-stride, pre-decimation).
   */
  readonly messageCount: number;
  readonly topic: string;

  /**
   * True when not every message is represented (scan cap or stride).
   */
  readonly truncated: boolean;
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
export type McapResourceReadPriority = "bulk" | "current" | "idle" | "playback";

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
   * Declares which source the owning renderer is presenting. Worker-backed
   * clients switch ownership here (cancelling the previous source's pending
   * reads while keeping the worker fleet warm); reads for non-active
   * sources then fail fast with the cancelled error. Callers that never
   * activate keep legacy request-driven switching.
   */
  activateSource?(source: ByteSourceDescriptor): void;

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
   * Pass a bulk priority for full-history context reads (e.g. trajectories)
   * so they never serialize current-frame, playback, or placement work.
   */
  readDecodedMessages(
    request: McapReadDecodedMessagesRequest,
    options?: McapResourceReadOptions,
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
   * Enumerates plottable numeric leaf fields per topic from channel
   * schemas (protobuf) or sampled messages (JSON). Independent of the
   * decoder registry — covers telemetry topics with no visualization.
   */
  enumerateNumericFields(
    request: McapEnumerateNumericFieldsRequest,
  ): Promise<readonly McapTopicNumericFields[]>;

  /**
   * Extracts a packed numeric time series for one topic's field paths.
   * Pass a bulk priority so full-history extraction never serializes
   * current-frame, playback, or placement work.
   */
  readNumericSeries(
    request: McapReadNumericSeriesRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapNumericSeriesResult>;

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
