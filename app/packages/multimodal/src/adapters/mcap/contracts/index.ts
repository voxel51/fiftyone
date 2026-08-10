import type {
  ByteSourceDescriptor,
  LaneTransportSnapshot,
} from "../../../query/bytes/index";
import type {
  BudgetedReadStopReason,
  ReadContinuation,
  ReadWorkBudget,
  ReadWorkUsage,
} from "../../../ports";
import type { TimeWindow } from "../../../ir";
import type { DecodeResult } from "../../../query/decoding/index";
import type {
  PlaybackSyncMode,
  StreamInventory,
} from "../../../schemas/v1/index";
import type { McapFrameTransformSet } from "../transforms/types";
import type { PointCloudRenderChannelPayload } from "../../../ir/index";

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

/** Internal resource request backing the format-neutral bounded-read port. */
export interface McapReadBoundedMessagesRequest {
  readonly absoluteBudget: ReadWorkBudget;
  readonly absoluteMaxChunks: number;
  readonly activeTimeline?: McapActiveTimeline;
  readonly admissionEndNs?: bigint;
  readonly budget: ReadWorkBudget;
  readonly continuation?: ReadContinuation;
  readonly endTimeNs?: bigint;
  readonly maxChunks: number;
  readonly preferredTimeNs?: bigint;
  readonly skipOversizedSourceUnit?: boolean;
  readonly source: ByteSourceDescriptor;
  readonly startTimeNs?: bigint;
  readonly topics: readonly string[];
}

/** Decoded partial result returned across the MCAP resource boundary. */
export interface McapReadBoundedMessagesResult {
  readonly continuation?: ReadContinuation;
  readonly coverageByTopic: ReadonlyMap<string, readonly TimeWindow[]>;
  readonly messages: readonly McapDecodedMessage[];
  readonly resumeAtNs?: bigint;
  readonly stopReason: BudgetedReadStopReason;
  readonly usage: ReadWorkUsage;
  readonly unavailableByTopic?: ReadonlyMap<string, readonly TimeWindow[]>;
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
   * Whether dynamic paths may be augmented from one bounded indexed chunk.
   * Defaults to true.
   */
  readonly includeDataFallback?: boolean;

  /**
   * MCAP source to inspect for channel schemas.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * Preferred log timestamp for bounded fallback sampling. The implementation
   * still opens at most one indexed chunk.
   */
  readonly sampleTimeNs?: bigint;

  /**
   * Optional MCAP topics to include. Undefined means all topics.
   */
  readonly topics?: readonly string[];
}

/**
 * One numeric leaf field of a topic's message schema, addressed by a
 * dotted path (e.g. `twist.linear.x`). Numeric segments address array
 * elements (e.g. `position.0`).
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
 * Why a generic schema-shaped decode path is unavailable for a topic.
 */
export type McapDecodeUnavailableReason =
  | "schema-unavailable"
  | "unsupported-encoding";

/**
 * Numeric field availability for one topic. Empty-field topics are
 * surfaced with a reason so the plot picker can distinguish unsupported
 * encodings, unreadable schemas, and decodable schemas with nothing scalar
 * to plot.
 */
export type McapNumericFieldAvailability =
  | "no-numeric-fields"
  | "ready"
  | McapDecodeUnavailableReason;

/**
 * Plottable numeric fields for one topic. `availability` explains empty
 * field lists so unsupported/degraded topics stay legible instead of
 * silently absent.
 */
export interface McapTopicNumericFields {
  readonly topic: string;
  readonly encoding:
    | "protobuf"
    | "json"
    | "ros1"
    | "cdr"
    | "mixed"
    | "unsupported";
  readonly availability: McapNumericFieldAvailability;

  /**
   * True when complete discovery requires bounded message sampling (JSON
   * channels carry no walkable schema, and dynamic paths cannot be known from
   * schemas alone). The result is intentionally partial and may be empty when
   * no usable indexed fallback chunk exists.
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
  /** Per-decimation-bucket discontinuity bits, when decimation was applied. */
  readonly bucketGapMask?: Uint8Array;
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

/** Numeric field projection requested for one MCAP topic in a shared slice. */
export interface McapNumericSeriesSelection {
  readonly fieldPaths: readonly string[];
  readonly topic: string;
}

/**
 * Request for one exact, budget-admitted page toward a larger numeric plot
 * horizon. Topics share one chunk traversal so multi-topic chunks are
 * decompressed once per page.
 */
export interface McapReadNumericSeriesSliceRequest {
  readonly absoluteBudget: ReadWorkBudget;
  readonly absoluteMaxChunks: number;
  readonly activeTimeline?: McapActiveTimeline;
  readonly budget: ReadWorkBudget;
  readonly continuation?: ReadContinuation;
  readonly endTimeNs: bigint;
  readonly maxChunks: number;
  readonly maxPointsPerField?: number;
  readonly preferredTimeNs?: bigint;
  readonly selections: readonly McapNumericSeriesSelection[];
  readonly source: ByteSourceDescriptor;
  readonly startTimeNs: bigint;
}

/** Packed exact numeric values for one topic in a shared slice result. */
export interface McapNumericTopicSeries {
  readonly fields: readonly McapNumericSeriesField[];
  readonly messageCount: number;
  readonly topic: string;
}

/** Partial numeric data and physical-work evidence returned for one page. */
export interface McapNumericSeriesSliceResult {
  readonly baseTimeNs: bigint;
  readonly continuation?: ReadContinuation;
  readonly coverageByTopic: ReadonlyMap<string, readonly TimeWindow[]>;
  /** Exact source spans omitted because one atomic unit exceeded the hard ceiling. */
  readonly skippedByTopic: ReadonlyMap<string, readonly TimeWindow[]>;
  readonly series: readonly McapNumericTopicSeries[];
  readonly stopReason: BudgetedReadStopReason;
  readonly usage: ReadWorkUsage;
}

/**
 * Budgets bounding how much of a decoded message record crosses the
 * worker boundary. Every budget has a conservative default; callers
 * only override for special views.
 */
export interface McapRawPruneBudgets {
  /**
   * Maximum elements kept per array (plain or typed).
   */
  readonly maxArrayLength?: number;

  /**
   * Maximum nesting depth before subtrees collapse to a truncation
   * marker.
   */
  readonly maxDepth?: number;

  /**
   * Maximum characters kept per string value.
   */
  readonly maxStringLength?: number;

  /**
   * Maximum total nodes in the pruned tree.
   */
  readonly maxTotalNodes?: number;
}

/**
 * Pruned, structured-clone-safe rendering of one decoded message value.
 * The worker walks the full decoded record but only this bounded tree
 * crosses the thread boundary — an 18 MB occupancy grid stays put.
 */
export type McapRawValueNode =
  | McapRawScalarNode
  | McapRawBytesNode
  | McapRawObjectNode
  | McapRawArrayNode
  | McapRawTruncatedNode;

/**
 * Leaf value, pre-stringified so 64-bit and non-finite values render
 * (and copy) without further coercion decisions in the UI.
 */
export interface McapRawScalarNode {
  readonly kind: "scalar";

  /**
   * Display-ready rendering of the value.
   */
  readonly value: string;
  readonly valueType:
    | "bigint"
    | "boolean"
    | "null"
    | "number"
    | "string"
    | "undefined";

  /**
   * True when a string value was cut at the string budget.
   */
  readonly truncated?: boolean;
}

/**
 * Byte payloads (protobuf `bytes` fields) summarize instead of listing
 * elements — a hex preview of the first bytes plus the true length.
 */
export interface McapRawBytesNode {
  readonly kind: "bytes";
  readonly byteLength: number;

  /**
   * Space-separated hex of the leading bytes.
   */
  readonly preview: string;
}

export interface McapRawObjectNode {
  readonly kind: "object";
  readonly entries: readonly (readonly [string, McapRawValueNode])[];

  /**
   * Keys dropped by the total-node budget.
   */
  readonly droppedEntries?: number;
}

export interface McapRawArrayNode {
  readonly kind: "array";
  readonly items: readonly McapRawValueNode[];

  /**
   * Real element count; greater than `items.length` when pruned.
   */
  readonly totalLength: number;
}

/**
 * Subtree collapsed by the depth or total-node budget.
 */
export interface McapRawTruncatedNode {
  readonly kind: "truncated";
  readonly reason: "depth" | "nodes";
}

/**
 * Request for one topic's schema-shaped message record at a playback
 * time.
 */
export interface McapReadRawMessageRecordRequest {
  /**
   * Timeline used to interpret `timeNs`; defaults to MCAP log time.
   */
  readonly activeTimeline?: McapActiveTimeline;

  /** Exact MCAP channel selected by a channel-preserving inventory row. */
  readonly channelId?: number;

  /**
   * Includes the complete decoded message as bounded compact JSON. This is
   * intentionally opt-in, uses base64 envelopes for byte buffers, and rejects
   * output beyond the documented whole-message export limit.
   */
  readonly includeFullJson?: boolean;

  /**
   * Optional overrides for the worker-side prune budgets.
   */
  readonly prune?: McapRawPruneBudgets;

  /**
   * MCAP source to read through the shared byte query layer.
   */
  readonly source: ByteSourceDescriptor;

  /**
   * Playback timeline time; the newest message at or before it is
   * selected, however far back.
   */
  readonly timeNs: bigint;

  /**
   * MCAP topic to read.
   */
  readonly topic: string;
}

/** Opaque physical identity of one MCAP message in one source epoch. */
export type McapMessageCursor = string;

/** Request for one exact indexed message. */
export interface McapReadRawMessageAtCursorRequest {
  /** Exact MCAP channel selected by a channel-preserving inventory row. */
  readonly channelId?: number;
  readonly cursor: McapMessageCursor;
  readonly includeFullJson?: boolean;
  readonly prune?: McapRawPruneBudgets;
  readonly source: ByteSourceDescriptor;
  readonly topic: string;
}

/** Request for a bounded index-only window around a time or exact message. */
export type McapReadMessageIndexWindowRequest = {
  readonly after: number;
  readonly before: number;
  /** Exact MCAP channel selected by a channel-preserving inventory row. */
  readonly channelId?: number;
  readonly source: ByteSourceDescriptor;
  readonly topic: string;
} & (
  | {
      readonly anchorCursor: McapMessageCursor;
      readonly anchorTimeNs?: never;
    }
  | {
      readonly anchorCursor?: never;
      readonly anchorTimeNs: bigint;
    }
);

/** One index-only message row. */
export interface McapMessageIndexEntry {
  readonly cursor: McapMessageCursor;
  readonly logTimeNs: bigint;
}

/** Bounded exact-message index window. */
export interface McapMessageIndexWindowResult {
  readonly entries: readonly McapMessageIndexEntry[];
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly selectedCursor: McapMessageCursor;
}

/** Request for one color channel aligned with an existing geometry payload. */
export interface McapReadPointCloudChannelRequest {
  readonly activeColorBy: string;
  readonly activeTimeline?: McapActiveTimeline;
  readonly capacity: number;
  readonly samplePlanKey: string;
  readonly sampledPointCount: number;
  readonly source: ByteSourceDescriptor;
  readonly sourceIndices: Uint32Array;
  readonly timeNs: bigint;
  readonly topic: string;
}

/** Worker-projected channel data; geometry remains owned by the main thread. */
export type McapPointCloudChannelResult = PointCloudRenderChannelPayload;

/**
 * Raw record read outcome: `ok` carries a pruned record tree;
 * `unsupported` carries message metadata when a generic decode path is
 * unavailable; `decode-error` marks a corrupt or schema-mismatched payload;
 * `empty` means the topic has no message at or before the requested time.
 */
export type McapRawMessageRecordStatus =
  | "decode-error"
  | "empty"
  | "ok"
  | "unsupported";

/**
 * One topic's message record (or its degrade) at a playback time.
 */
export interface McapRawMessageRecordResult {
  /** Exact physical identity, present only for indexed selections. */
  readonly cursor?: McapMessageCursor;
  readonly status: McapRawMessageRecordStatus;
  readonly topic: string;
  readonly messageEncoding: string;
  readonly schemaName: string | null;

  /**
   * Validity window in the active timeline: any request time in
   * `[validFromNs, validUntilNs)` selects this same result, so callers
   * skip refetching inside it. `validUntilNs` is a safe lower bound —
   * probing stops at a bounded horizon, and a request past it simply
   * re-selects and extends.
   */
  readonly validFromNs: bigint;
  readonly validUntilNs: bigint;

  /**
   * Selected message identity/metadata; absent when `empty`.
   */
  readonly logTimeNs?: bigint;
  readonly publishTimeNs?: bigint;
  readonly sequence?: number;
  readonly encodedPayloadBytes?: number;
  readonly decodeUnavailableReason?: McapDecodeUnavailableReason;

  /**
   * Complete decoded message JSON, present only when explicitly requested.
   * Unlike `root`, this value is not subject to inspector display budgets.
   */
  readonly fullJson?: string;

  /**
   * Pruned record tree; present only when `ok`.
   */
  readonly root?: McapRawObjectNode;

  /**
   * True when any prune budget cut the tree.
   */
  readonly truncated?: boolean;

  /**
   * Decoder failure detail; present only when `decode-error`.
   */
  readonly decodeError?: string;
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
   * Dynamic child frames that an exact-time placement read must anchor.
   * When present, the adapter returns explicit placement coverage metadata
   * instead of silently treating a partial predecessor tail as complete.
   */
  readonly requiredDynamicChildFrameIds?: readonly string[];

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
 * One point of the cumulative compressed-byte curve over a timeline: after
 * `endTimeNs`, playback from the file start has consumed
 * `cumulativeCompressedBytes` of chunk data.
 */
export interface McapByteTimelinePoint {
  /**
   * Compressed chunk bytes accumulated through this chunk, in time order.
   */
  readonly cumulativeCompressedBytes: number;

  /**
   * Inclusive timeline end of the chunk contributing the bytes.
   */
  readonly endTimeNs: bigint;

  /**
   * File offset where the chunk starts. Cumulative bytes measure volume
   * (bitrate math); this anchors the chunk in the file for consumers that
   * bank or prefetch real byte ranges.
   */
  readonly startOffsetBytes: bigint;
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
   * Cumulative compressed chunk bytes by chunk end time, ascending.
   * Consumers estimate "bytes needed to play [t0, t1]" from deltas —
   * the bandwidth-aware startup gate sizes its cushion with this.
   */
  readonly byteTimeline?: readonly McapByteTimelinePoint[];

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
  /** Active point-cloud color source requested per MCAP topic. */
  readonly pointCloudColorByByTopic?: Readonly<Record<string, string>>;
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
   * Playback times to resolve against the same source/topic/policy request.
   */
  readonly timeNs: readonly bigint[];
}

/**
 * Scheduling priority for resource reads where callers know whether the work
 * is immediately user-visible or opportunistic.
 */
export type McapResourceReadPriority =
  | "bulk"
  | "current"
  | "idle"
  | "inspection"
  | "playback";

/**
 * Optional scheduling hints for MCAP resource reads.
 */
export interface McapResourceReadOptions {
  readonly priority?: McapResourceReadPriority;
  readonly signal?: AbortSignal;
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
   * Collision-safe identity of this decoded artifact when the indexed reader
   * can address the underlying physical record. Includes decoder options that
   * can change the output. Raw-reader fallbacks omit it rather than inventing
   * an identity from potentially reused message metadata.
   */
  readonly recordId?: string;

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

  /** Payload decode failures, contained to their topic for this window. */
  readonly decodeErrorsByTopic?: Readonly<
    Record<string, readonly McapTopicDecodeDiagnostic[]>
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

/** Serializable details for one topic failure in a synchronized window. */
export interface McapTopicDecodeDiagnostic {
  readonly code: "message-decode-failed";
  readonly message: string;
  readonly messageTimeNs: bigint;
  readonly payloadIdentity: string;
  readonly requestedTimeNs: bigint;
  readonly topic: string;
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
   * Releases heavyweight decoded resources and source-bound reader state when
   * no renderer currently owns the client, while allowing workers to remain
   * warm and restart their readers lazily.
   */
  releaseRetainedResources?(): void;

  /**
   * Declares which source the owning renderer is presenting. Worker-backed
   * clients switch ownership here (cancelling the previous source's pending
   * reads while keeping the worker fleet warm); reads for non-active
   * sources then fail fast with the cancelled error. Callers that never
   * activate keep request-driven switching.
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
   * Cancels queued and in-flight foreground playback batches made obsolete
   * by a discontinuous seek. Current-frame and placement reads are preserved.
   */
  cancelRunwayReads?(): void;

  /**
   * Subscribes to cumulative network-transport snapshots from worker-backed
   * read lanes. Inline clients omit this; network-health consumers treat it as
   * optional.
   */
  subscribeTransport?(
    listener: (sample: LaneTransportSnapshot) => void,
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

  /** Executes one admitted, resumable MCAP chunk grant. */
  readBoundedMessages(
    request: McapReadBoundedMessagesRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapReadBoundedMessagesResult>;

  /**
   * Returns the playable time range for the active timeline.
   */
  readTimelineRange(
    request: McapReadTimelineRangeRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapTimelineRange>;

  /**
   * Reads stream inventory entries from MCAP summary channel metadata.
   */
  readTopics(
    request: McapReadTopicsRequest,
    options?: McapResourceReadOptions,
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
   * Extracts one cancellable, continuation-paged numeric slice for multiple
   * topics in a single bounded chunk traversal.
   */
  readNumericSeriesSlice?(
    request: McapReadNumericSeriesSliceRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapNumericSeriesSliceResult>;

  /**
   * Reads one topic's schema-shaped message record at a playback time,
   * pruned worker-side to bounded size. Rides the idle lane so a large
   * decode never stalls current-frame or playback reads.
   */
  readRawMessageRecord(
    request: McapReadRawMessageRecordRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapRawMessageRecordResult>;

  /** Reads one exact indexed message on the interactive inspection lane. */
  readRawMessageAtCursor?(
    request: McapReadRawMessageAtCursorRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapRawMessageRecordResult>;

  /** Reads a bounded index-only window for interactive inspection. */
  readMessageIndexWindow?(
    request: McapReadMessageIndexWindowRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapMessageIndexWindowResult>;

  /** Projects one replacement point-cloud channel without rebuilding XYZ. */
  readPointCloudChannel?(
    request: McapReadPointCloudChannelRequest,
    options?: McapResourceReadOptions,
  ): Promise<McapPointCloudChannelResult>;

  /**
   * Reads eager frame transforms needed for initial 3D placement.
   */
  readFrameTransformBootstrap(
    request: McapReadFrameTransformBootstrapRequest,
    options?: McapResourceReadOptions,
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
    options?: McapResourceReadOptions,
  ): Promise<McapSynchronizedMessageWindow>;

  /**
   * Reads multiple synchronized windows for playback lookahead/prefetch.
   */
  readSynchronizedMessageBatch(
    request: McapReadSynchronizedMessageBatchRequest,
    options?: McapResourceReadOptions,
  ): Promise<readonly McapSynchronizedMessageWindow[]>;
}
