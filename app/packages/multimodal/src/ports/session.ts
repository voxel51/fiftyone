import type {
  ByteRange,
  ByteSourceDescriptor,
  DecodedFrame,
  EpisodeManifest,
  NumericSeriesResult,
  NumericStreamFields,
  EpisodeTimeline,
  LaneTransportSnapshot,
  RawRecordPruneBudgets,
  RawRecordResult,
  RawRecordStream,
  StreamId,
  StreamSyncPolicies,
  StreamSyncPolicy,
  StreamTimeBounds,
  SynchronizedFrameWindow,
  TimeWindow,
  TransformSample,
} from "../ir";

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
  readBootstrap?(): Promise<readonly TransformSample[]>;
  readTransforms(request: ReadRequest): Promise<readonly TransformSample[]>;
}

/** One synchronized playback read around a single presentation time. */
export interface SynchronizedPlaybackReadRequest {
  readonly defaultStreamPolicy?: StreamSyncPolicy;
  readonly streamPolicies?: StreamSyncPolicies;
  readonly streams: readonly StreamId[];
  readonly timeNs: bigint;
}

/** One synchronized playback read spanning several presentation times. */
export interface SynchronizedPlaybackBatchReadRequest {
  readonly defaultStreamPolicy?: StreamSyncPolicy;
  readonly streamPolicies?: StreamSyncPolicies;
  readonly streams: readonly StreamId[];
  readonly timeNs: readonly bigint[];
}

/** Optional controls for a synchronized playback batch. */
export interface SynchronizedPlaybackReadOptions {
  readonly priority?: ReadPriority;
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

/** Optional semantic capability for plottable scalar fields. */
export interface NumericSeriesCapability {
  enumerateNumericFields(
    streams?: readonly StreamId[],
  ): Promise<readonly NumericStreamFields[]>;
  readNumericSeries(request: {
    readonly fields: readonly string[];
    readonly maxPointsPerField?: number;
    readonly stream: StreamId;
    readonly window: TimeWindow;
  }): Promise<NumericSeriesResult>;
}

/** Optional semantic capability for bounded raw-record inspection. */
export interface RawRecordCapability {
  listRawRecordStreams(): Promise<readonly RawRecordStream[]>;
  readRawRecord(request: {
    readonly includeFullJson?: boolean;
    readonly prune?: RawRecordPruneBudgets;
    readonly stream: StreamId;
    readonly timestampNs: bigint;
  }): Promise<RawRecordResult>;
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
  readonly manifest: EpisodeManifest;
  readonly numericSeries?: NumericSeriesCapability;
  readonly playback?: PlaybackReadCapability;
  readonly rawRecords?: RawRecordCapability;
  readonly synchronizedRead?: SynchronizedReadAcceleration;
  readonly terminology?: EpisodeTerminology;
  readonly transformRead?: TransformReadAcceleration;

  activate?(): void;
  cancelIdle?(): void;
  dispose(): void;
  read(request: ReadRequest): AsyncIterable<FrameBatch>;
  stats?(): SourceStats;
}
