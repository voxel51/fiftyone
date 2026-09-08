import type {
  ByteRange,
  ByteSourceDescriptor,
  DecodedFrame,
  EpisodeManifest,
  NumericSeriesResult,
  NumericStreamFields,
  PointCloudRenderChannelPayload,
  EpisodeTimeline,
  LaneTransportSnapshot,
  RawRecordPruneBudgets,
  RawRecordCursor,
  RawRecordIndexWindow,
  RawRecordIndexWindowRequest,
  RawRecordResult,
  RawRecordStream,
  StreamId,
  StreamSyncPolicies,
  StreamSyncPolicy,
  StreamTimeBounds,
  SynchronizedFrameWindow,
  TimeWindow,
  TransformSample,
  EpisodeTransformTopologyEdgeObservation,
  EpisodeTransformTopologyFrameUse,
} from "../ir";
import type { StateActionCapability } from "./state-action";

/** Four proven scheduling lanes exposed by every episode session. */
export type ReadPriority = "bulk" | "current" | "idle" | "playback";

/** One cloneable byte read request issued by a format adapter. */
export interface ByteResourceReadRequest {
  readonly range: ByteRange;
  readonly signal?: AbortSignal;
  readonly source: ByteSourceDescriptor;
}

/** One cloneable byte read response returned to a format adapter. */
export interface ByteResourceReadResult {
  readonly bytes: Uint8Array;
  readonly range: ByteRange;
  readonly source: ByteSourceDescriptor;
}

/** Source-agnostic byte resources supplied when an adapter opens. */
export interface ByteResources {
  readBytes(request: ByteResourceReadRequest): Promise<ByteResourceReadResult>;
}

/** Read request for one or more streams over inclusive nanosecond bounds. */
export interface ReadRequest {
  readonly limit?: number;
  readonly priority?: ReadPriority;
  readonly signal?: AbortSignal;
  readonly streams: readonly StreamId[];
  readonly window: TimeWindow;
}

/** Pull-based decoded frames for one stream. */
export interface FrameBatch {
  readonly frames: readonly DecodedFrame[];
  readonly stream: StreamId;
}

/** Hard work limits for one resumable source read grant. */
export interface ReadWorkBudget {
  /** Decoded messages admitted for this grant. */
  readonly maxMessages: number;
  /** Logical source bytes admitted, including cache-served physical ranges. */
  readonly maxSourceBytes: number;
  /** Bytes admitted after source decompression. */
  readonly maxUncompressedBytes: number;
  /** Cooperative elapsed-time limit checked at bounded work boundaries. */
  readonly maxWallTimeMs: number;
}

/** Physical work attributed to one bounded read grant. */
export interface ReadWorkUsage {
  readonly chunksOpened: number;
  readonly decompressedBytes: number;
  readonly decompressionCacheHits: number;
  readonly elapsedMs: number;
  readonly logicalSourceBytes: number;
  readonly logicalUncompressedBytes: number;
  readonly messagesDecoded: number;
  readonly transferredBytes: number;
}

/** Why a bounded grant returned control to its caller. */
export type BudgetedReadStopReason =
  | "account-exhausted"
  | "budget-exhausted"
  | "horizon-reached"
  | "oversized-source-unit"
  | "source-exhausted";

declare const READ_CONTINUATION_BRAND: unique symbol;

/**
 * Opaque, source-bound position returned by a bounded adapter read.
 *
 * Callers may only return this value to the job that produced it.
 */
export type ReadContinuation = object & {
  readonly [READ_CONTINUATION_BRAND]?: never;
};

/** One explicit slice requested from a source-scoped budget account. */
export interface BudgetedReadRequest {
  /**
   * Optional inclusive admission horizon within the stable request window.
   * Atomic source groups wholly after this time remain behind the returned
   * continuation; a group overlapping the horizon may be admitted in full.
   */
  readonly admissionEndNs?: bigint;
  readonly budget: ReadWorkBudget;
  readonly continuation?: ReadContinuation;
  /**
   * Stable center for a source-defined center-out traversal. The value is
   * continuation-bound and must not change while a job is resumed.
   */
  readonly preferredTimeNs?: bigint;
  /**
   * Advances past an atomic source unit that cannot fit this grant, recording
   * it as unavailable instead of returning the same zero-progress cursor.
   */
  readonly skipOversizedSourceUnit?: boolean;
  readonly signal?: AbortSignal;
  readonly streams: readonly StreamId[];
  readonly window: TimeWindow;
}

/** Partial or complete data returned by one bounded source read grant. */
export interface BudgetedReadResult {
  readonly batches: readonly FrameBatch[];
  readonly continuation?: ReadContinuation;
  readonly coverageByStream: ReadonlyMap<StreamId, readonly TimeWindow[]>;
  /** Earliest atomic-group start still behind the continuation. */
  readonly resumeAtNs?: bigint;
  readonly stopReason: BudgetedReadStopReason;
  readonly usage: ReadWorkUsage;
  /** Exact source spans skipped because an atomic unit exceeded a hard grant. */
  readonly unavailableByStream?: ReadonlyMap<StreamId, readonly TimeWindow[]>;
}

/** One independently resumable job sharing its source account's allowance. */
export interface BudgetedReadJob {
  read(request: BudgetedReadRequest): Promise<BudgetedReadResult>;
}

/**
 * One source-account reservation for work outside a decoded read job, such as
 * speculative byte-cache warming.
 */
export interface SourceReadBudgetReservation {
  readonly budget: ReadWorkBudget;
  commit(usage: ReadWorkUsage, options?: { readonly exact?: boolean }): void;
}

/** Source-scoped cumulative allowance shared by every job created from it. */
export interface SourceReadBudgetAccount {
  createJob(): BudgetedReadJob;
  remaining(): ReadWorkBudget;

  /**
   * Reserves non-decoding source work from this same cumulative account.
   *
   * The reservation is charged immediately. Exact settlement refunds only
   * demonstrably unused work; conservative settlement retains the charge.
   */
  reserve(budget: ReadWorkBudget): SourceReadBudgetReservation | undefined;
}

/** Optional format-neutral bounded-read surface on an episode session. */
export interface BoundedReadCapability {
  /**
   * Opens the source account once. Omitting the allowance selects the
   * adapter's fixed source policy. Reopening with a different allowance is
   * rejected so job recreation cannot reset or enlarge cumulative work.
   */
  openAccount(allowance?: ReadWorkBudget): SourceReadBudgetAccount;
}

/** Monotone source telemetry reported in shared runtime units. */
export interface SourceStats {
  readonly capturedAtMs: number;
  readonly decodedFrames: number;
  readonly readRequests: number;
  readonly returnedBatches: number;
  readonly transferredBytes?: number;
}

/** Optional fast path for synchronized stream windows. */
export interface SynchronizedReadAcceleration {
  readSynchronized(request: ReadRequest): Promise<readonly FrameBatch[]>;
}

/** Optional fast path for transform-window assembly. */
export interface TransformReadAcceleration {
  readBootstrap?(options?: {
    readonly signal?: AbortSignal;
  }): Promise<readonly TransformSample[]>;
  /**
   * Reads an edge-complete held placement at one timeline time. A null result
   * means completeness could not be proven within the adapter's bounded
   * lookup policy; callers must retain their normal window fallback.
   */
  readPlacement?(
    request: TransformPlacementReadRequest,
  ): Promise<TransformPlacementReadResult | null>;
  readTransforms(request: ReadRequest): Promise<readonly TransformSample[]>;
}

/** One cancellable, resumable grant toward a recording-wide topology scan. */
export interface TransformTopologyScanRequest {
  readonly budget: ReadWorkBudget;
  readonly continuation?: ReadContinuation;
  readonly signal?: AbortSignal;
}

/**
 * Bounded topology evidence. Absence of a continuation proves completion only
 * when `stopReason` is `source-exhausted` and no unavailable spans exist.
 */
export interface TransformTopologyScanResult {
  readonly continuation?: ReadContinuation;
  readonly coverageByStream: ReadonlyMap<StreamId, readonly TimeWindow[]>;
  readonly edges: readonly EpisodeTransformTopologyEdgeObservation[];
  /** One source-bounded playhead sample, not whole-recording frame coverage. */
  readonly frameUses: readonly EpisodeTransformTopologyFrameUse[];
  readonly stopReason: BudgetedReadStopReason;
  readonly unavailableByStream?: ReadonlyMap<StreamId, readonly TimeWindow[]>;
  readonly usage: ReadWorkUsage;
}

/** One deliberately incomplete point-in-time topology sample. */
export interface TransformTopologySampleRequest {
  readonly signal?: AbortSignal;
  /** Episode timeline time captured when the user requested the sample. */
  readonly timeNs: bigint;
}

/** Minimal transform evidence for rendering a graph without a recording scan. */
export interface TransformTopologySampleResult {
  readonly edges: readonly EpisodeTransformTopologyEdgeObservation[];
  readonly frameUses: readonly EpisodeTransformTopologyFrameUse[];
  readonly sampledAtNs: bigint;
}

/** Optional format-neutral, demand-driven transform-topology diagnostic. */
export interface TransformTopologyCapability {
  /** Uses the adapter's targeted playback path; never resumes an aggregate scan. */
  sample?(
    request: TransformTopologySampleRequest,
  ): Promise<TransformTopologySampleResult>;
  scan(
    request: TransformTopologyScanRequest,
  ): Promise<TransformTopologyScanResult>;
}

/** Exact-time transform placement requested from an accelerated adapter. */
export interface TransformPlacementReadRequest {
  readonly requiredDynamicChildFrameIds: readonly string[];
  readonly signal?: AbortSignal;
  readonly timeNs: bigint;
}

/** Proven transform placement plus the timeline interval it safely indexes. */
export interface TransformPlacementReadResult {
  readonly indexedWindow: TimeWindow;
  readonly samples: readonly TransformSample[];
}

/** One authoritative stream result within a synchronized presentation read. */
export interface SynchronizedStreamSettlement {
  /** The only stream whose ownership is settled by this window. */
  readonly stream: StreamId;
  /** Authoritative payload, empty result, or diagnostics for `stream`. */
  readonly window: SynchronizedFrameWindow;
}

/** One synchronized playback read around a single presentation time. */
export interface SynchronizedPlaybackReadRequest {
  readonly defaultStreamPolicy?: StreamSyncPolicy;
  /** Streams eligible for the first independently useful settlement. */
  readonly firstUsefulSettlementStreams?: readonly StreamId[];
  /**
   * Receives ordered, authoritative per-stream ownership settlements.
   * Adapters may also report the same settlement through
   * `onStreamSettlements`, so consumers registering both must be idempotent.
   */
  readonly onStreamSettlement?: (
    settlement: SynchronizedStreamSettlement,
  ) => void;
  /**
   * Receives one ordered transport delivery group. Every member remains an
   * independent authoritative stream settlement; the group lets consumers
   * publish simultaneously available presentation surfaces in one store turn.
   * Members may also be reported through `onStreamSettlement` when registered.
   */
  readonly onStreamSettlements?: (
    settlements: readonly SynchronizedStreamSettlement[],
  ) => void;
  /** Active point-cloud color source requested per stream. */
  readonly pointCloudColorBy?: Readonly<Record<StreamId, string>>;
  /** Stable presentation order for streams that gate current-tick readiness. */
  readonly settlementPriorityStreams?: readonly StreamId[];
  readonly streamPolicies?: StreamSyncPolicies;
  readonly streams: readonly StreamId[];
  readonly signal?: AbortSignal;
  readonly timeNs: bigint;
}

/** One synchronized playback read spanning several presentation times. */
export interface SynchronizedPlaybackBatchReadRequest {
  readonly defaultStreamPolicy?: StreamSyncPolicy;
  /** Active point-cloud color source requested per stream. */
  readonly pointCloudColorBy?: Readonly<Record<StreamId, string>>;
  readonly streamPolicies?: StreamSyncPolicies;
  readonly streams: readonly StreamId[];
  readonly timeNs: readonly bigint[];
}

/** Optional controls for a synchronized playback batch. */
export interface SynchronizedPlaybackReadOptions {
  readonly priority?: ReadPriority;
  readonly signal?: AbortSignal;
}

/**
 * Semantics-equivalent playback acceleration. The shared runtime emulates this
 * entire surface over mandatory `read()` when an adapter does not provide it.
 */
export interface PlaybackReadCapability {
  readonly timeline: EpisodeTimeline;
  readStreamTimeBounds(
    streams: readonly StreamId[],
  ): Promise<readonly StreamTimeBounds[]>;
  readSynchronized(
    request: SynchronizedPlaybackReadRequest,
  ): Promise<SynchronizedFrameWindow>;
  readSynchronizedBatch(
    request: SynchronizedPlaybackBatchReadRequest,
    options?: SynchronizedPlaybackReadOptions,
  ): Promise<readonly SynchronizedFrameWindow[]>;
  subscribeTransport?(
    listener: (sample: LaneTransportSnapshot) => void,
  ): () => void;
}

/** Hints for bounded numeric-field fallback discovery. */
export interface NumericFieldEnumerationOptions {
  /**
   * Whether dynamic paths may be augmented from bounded message data.
   * False returns the schema-derived catalog without waiting for fallback I/O.
   */
  readonly includeDataFallback?: boolean;

  /**
   * Preferred timestamp for bounded data-backed fallback discovery.
   * Adapters may ignore it when their schema is fully descriptive.
   */
  readonly sampleTimeNs?: bigint;
}

/** Optional semantic capability for plottable scalar fields. */
export interface NumericSeriesCapability {
  enumerateNumericFields(
    streams?: readonly StreamId[],
    options?: NumericFieldEnumerationOptions,
  ): Promise<readonly NumericStreamFields[]>;
  readNumericSeries(request: {
    readonly fields: readonly string[];
    readonly maxPointsPerField?: number;
    readonly signal?: AbortSignal;
    readonly stream: StreamId;
    readonly window: TimeWindow;
  }): Promise<NumericSeriesResult>;

  /**
   * Reads one exact, source-bounded numeric slice for every selected stream in
   * a shared physical traversal. Adapters without chunk/index admission may
   * omit this and keep the legacy single-stream read above.
   */
  readNumericSeriesSlice?(
    request: NumericSeriesSliceRequest,
  ): Promise<NumericSeriesSliceResult>;
}

/** Numeric fields projected for one stream during a shared slice read. */
export interface NumericSeriesSliceSelection {
  readonly fields: readonly string[];
  readonly stream: StreamId;
}

/** One cancellable, resumable grant toward a larger plot horizon. */
export interface NumericSeriesSliceRequest {
  readonly absoluteBudget: ReadWorkBudget;
  readonly absoluteMaxChunks: number;
  /** Absolute-time-aligned aggregate resolution requested by the viewport. */
  readonly bucketDurationNs: bigint;
  readonly budget: ReadWorkBudget;
  readonly continuation?: ReadContinuation;
  readonly maxChunks: number;
  readonly preferredTimeNs?: bigint;
  readonly selections: readonly NumericSeriesSliceSelection[];
  readonly signal?: AbortSignal;
  readonly window: TimeWindow;
}

/** Exact partial numeric data and work evidence for one admitted grant. */
export interface NumericSeriesSliceResult {
  readonly continuation?: ReadContinuation;
  readonly coverageByStream: ReadonlyMap<StreamId, readonly TimeWindow[]>;
  /** Earliest timestamp not yet inspected by a chronological continuation. */
  readonly resumeAtNs?: bigint;
  /** Exact unreadable source spans, distinct from successfully inspected coverage. */
  readonly unavailableByStream?: ReadonlyMap<StreamId, readonly TimeWindow[]>;
  readonly series: readonly NumericSeriesResult[];
  readonly stopReason: BudgetedReadStopReason;
  readonly usage: ReadWorkUsage;
}

/** Optional semantic capability for bounded raw-record inspection. */
export interface RawRecordCapability {
  listRawRecordStreams(options?: {
    readonly signal?: AbortSignal;
  }): Promise<readonly RawRecordStream[]>;
  readRawRecord(request: {
    readonly includeFullJson?: boolean;
    /**
     * Scheduling attribution. Paused inspection may use an isolated
     * responsive lane; continuous playback stays idle and full export stays
     * bulk so neither can head-of-line block playback.
     */
    readonly intent?: "background" | "paused-inspection" | "export";
    readonly prune?: RawRecordPruneBudgets;
    /**
     * Selects whether the adapter should decode the record body or return only
     * message metadata. Metadata reads are intended for callers such as size
     * estimators that only need payload byte counts.
     */
    readonly select?: "metadata" | "record";
    readonly signal?: AbortSignal;
    readonly stream: StreamId;
    readonly timestampNs: bigint;
  }): Promise<RawRecordResult>;
  /** Reads one exact indexed record without consulting the playback clock. */
  readRawRecordAtCursor?(request: {
    readonly cursor: RawRecordCursor;
    readonly includeFullJson?: boolean;
    /** Whole-message JSON export remains on the bounded bulk lane. */
    readonly intent?: "browse" | "export";
    readonly prune?: RawRecordPruneBudgets;
    readonly signal?: AbortSignal;
    readonly stream: StreamId;
  }): Promise<RawRecordResult>;
  /** Reads a bounded index-only window around a time or exact record. */
  readRawRecordIndexWindow?(
    request: RawRecordIndexWindowRequest & {
      readonly signal?: AbortSignal;
      readonly stream: StreamId;
    },
  ): Promise<RawRecordIndexWindow>;
}

/** On-demand point-cloud channel projection over an immutable geometry plan. */
export interface PointCloudProjectionCapability {
  readChannel(request: {
    readonly activeColorBy: string;
    readonly capacity: number;
    readonly sampledPointCount: number;
    readonly samplePlanKey: string;
    readonly signal?: AbortSignal;
    readonly sourceIndices: Uint32Array;
    readonly stream: StreamId;
    readonly timestampNs: bigint;
  }): Promise<PointCloudRenderChannelPayload>;
}

/** Format-selected nouns used by the shared episode viewer. */
export interface EpisodeTerminology {
  readonly stream?: {
    readonly plural: string;
    readonly singular: string;
  };
}

/** Open, format-neutral episode data plane consumed by the shared runtime. */
export interface EpisodeSession {
  readonly boundedRead?: BoundedReadCapability;
  readonly manifest: EpisodeManifest;
  readonly numericSeries?: NumericSeriesCapability;
  readonly playback?: PlaybackReadCapability;
  readonly pointCloudProjection?: PointCloudProjectionCapability;
  readonly rawRecords?: RawRecordCapability;
  readonly stateAction?: StateActionCapability;
  readonly synchronizedRead?: SynchronizedReadAcceleration;
  readonly terminology?: EpisodeTerminology;
  readonly transformRead?: TransformReadAcceleration;
  readonly transformTopology?: TransformTopologyCapability;

  activate?(): void;
  cancelIdle?(): void;
  /** Cancels lookahead runway made obsolete by a discontinuous seek. */
  cancelRunway?(): void;
  dispose(): void;
  read(request: ReadRequest): AsyncIterable<FrameBatch>;
  stats?(): SourceStats;
}
