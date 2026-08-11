import type { DecodedFrame, PointCloudRenderChannelPayload } from "../ir";
import type { TimelineIndex } from "./timeline-index";

/** Minimum identity required for a source-scoped runtime data stream. */
export interface SourceScopedDataStream {
  readonly sourceKey: string;
}

/** Presentation preferences that affect worker-side stream projection. */
export interface StreamSubscriptionOptions {
  readonly pointCloudColorBy?: string;
}

/** Hard, request-local limits for one chronological stream-frame read. */
export interface StreamFrameReadBudget {
  /** Absolute timestamp from the shared monotonic clock. */
  readonly deadlineMs: number;
  /** Maximum messages this read may fold and retain. */
  readonly maxMessages: number;
  /**
   * Maximum observed decoded-record/compressed-payload bytes. This is not a
   * physical-transfer or decompressed-byte guarantee.
   */
  readonly maxObservedPayloadBytes: number;
}

/** One bounded stream-frame read over inclusive nanosecond bounds. */
export interface StreamFrameReadRequest {
  readonly budget: StreamFrameReadBudget;
  readonly endTimeNs: bigint;
  readonly signal?: AbortSignal;
  readonly startTimeNs: bigint;
  readonly stream: string;
}

/** Quality of the evidence used for observed payload accounting. */
export type StreamFramePayloadMeasurementQuality =
  | "encoded-video-bytes"
  | "mixed"
  | "resource-hints"
  | "unknown";

/** Why a bounded stream-frame read returned control to its caller. */
export type StreamFrameReadStopReason =
  | "aborted"
  | "complete"
  | "message-ceiling"
  | "observed-byte-ceiling"
  | "wall-time-ceiling";

/** Work observed while folding decoded batches from a stream-frame read. */
export interface StreamFrameReadEvidence {
  readonly elapsedMs: number;
  readonly measurementQuality: StreamFramePayloadMeasurementQuality;
  /** Bytes beyond the ceiling admitted with the first oversized record. */
  readonly observedPayloadByteOvershoot: number;
  readonly observedPayloadBytes: number;
  readonly scannedMessages: number;
  readonly unknownPayloadMessages: number;
}

/** Structured result that distinguishes completion, cancellation, and caps. */
export interface StreamFrameReadResult<TFrame> {
  readonly evidence: StreamFrameReadEvidence;
  readonly frames: readonly TFrame[];
  readonly stopReason: StreamFrameReadStopReason;
}

/** Format-neutral data stream published to episode consumers. */
export interface DataStream<
  TFrame = DecodedFrame,
  TCache = unknown,
> extends SourceScopedDataStream {
  readonly getStreamCache: (stream: string) => TCache | undefined;
  readonly getTimelineIndex: () => TimelineIndex | null;
  readonly readStreamFrames?: (
    request: StreamFrameReadRequest,
  ) => Promise<StreamFrameReadResult<TFrame>>;
  readonly readPointCloudChannel?: (request: {
    readonly activeColorBy: string;
    readonly capacity: number;
    readonly sampledPointCount: number;
    readonly samplePlanKey: string;
    readonly signal?: AbortSignal;
    readonly sourceIndices: Uint32Array;
    readonly stream: string;
    readonly timestampNs: bigint;
  }) => Promise<PointCloudRenderChannelPayload>;
  readonly subscribeToStream: (
    stream: string,
    options?: StreamSubscriptionOptions,
  ) => () => void;
}

/** Erased frame/cache specialization stored by React integrations. */
export type AnyEpisodeDataStream = DataStream<unknown, unknown>;
