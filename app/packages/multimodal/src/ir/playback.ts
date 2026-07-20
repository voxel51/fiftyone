import type { DecodedFrame } from "./frames";
import type { StreamId } from "./manifest";
import type { ByteTimelinePoint } from "./time";

/** Runtime-owned frame selection modes, independent of generated schemas. */
export const STREAM_SYNC_MODE = Object.freeze({
  LATEST: "latest",
  NEAREST: "nearest",
  STRICT: "strict",
} as const);

export type StreamSyncMode =
  (typeof STREAM_SYNC_MODE)[keyof typeof STREAM_SYNC_MODE];

/** Stream-local presentation policy around one playback time. */
export interface StreamSyncPolicy {
  readonly limit?: number;
  readonly mode?: StreamSyncMode;
  readonly toleranceAfterNs?: bigint;
  readonly toleranceBeforeNs?: bigint;
}

export type StreamSyncPolicies = Readonly<Record<StreamId, StreamSyncPolicy>>;

/** Concrete selection bounds after runtime defaults have been applied. */
export interface ResolvedStreamSyncPolicy {
  readonly endNs: bigint;
  readonly limit: number;
  readonly mode: StreamSyncMode;
  readonly startNs?: bigint;
}

/** One contained payload failure in a synchronized stream window. */
export interface StreamDecodeDiagnostic {
  readonly code: "frame-decode-failed";
  readonly message: string;
  readonly payloadIdentity: string;
  readonly requestedTimeNs: bigint;
  readonly streamId: StreamId;
  readonly timestampNs: bigint;
}

/** Frames selected for every requested stream around one playback time. */
export interface SynchronizedFrameWindow {
  readonly diagnosticsByStream?: Readonly<
    Record<StreamId, readonly StreamDecodeDiagnostic[]>
  >;
  readonly endNs: bigint;
  readonly frames: readonly DecodedFrame[];
  readonly framesByStream: Readonly<Record<StreamId, readonly DecodedFrame[]>>;
  readonly startNs: bigint;
  readonly streamPolicies: Readonly<Record<StreamId, ResolvedStreamSyncPolicy>>;
  readonly timeNs: bigint;
}

/** Indexed first/last timestamps for one stream. */
export interface StreamTimeBounds {
  readonly firstTimestampNs: bigint | null;
  readonly lastTimestampNs: bigint | null;
  readonly streamId: StreamId;
}

/** Playable timeline metadata retained for bandwidth-aware scheduling. */
export interface EpisodeTimeline {
  readonly byteTimeline?: readonly ByteTimelinePoint[];
  readonly endNs: bigint;
  readonly startNs: bigint;
  readonly timeDomainId: string;
}

/** Shared scheduling lane used by source transport telemetry. */
export type TransportLane = "foreground" | "idle" | "bulk";

/** Cumulative network counters for one reader context. */
export interface NetworkTransportSnapshot {
  readonly busyMs: number;
  readonly capturedAtMs: number;
  readonly fetchedBytes: number;
  readonly reads: number;
}

/** One lane's cumulative transport counters. */
export interface LaneTransportSnapshot {
  readonly lane: TransportLane;
  readonly snapshot: NetworkTransportSnapshot;
}
