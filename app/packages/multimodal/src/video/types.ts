import type { EncodedH264VideoVisualization } from "../ir";

/** One timestamped H.264 access unit owned by the video engine. */
export interface H264AccessUnit {
  readonly frame: EncodedH264VideoVisualization;
  readonly timeNs: bigint;
}

/** Presentation copy that no longer owns a WebCodecs decoder surface. */
export interface VideoPresentationLease {
  readonly height: number;
  readonly source: CanvasImageSource;
  readonly timeNs: bigint;
  readonly width: number;
  release(): void;
}

/**
 * Refcounted presentation shared by every renderer of one stream.
 *
 * Releasing the engine owner does not invalidate extant renderer leases. As
 * long as one such lease retains the copied surface, another renderer may
 * acquire it. `acquire()` returns null after the final reference disposes the
 * surface.
 */
export interface VideoPresentation {
  readonly height: number;
  readonly live: boolean;
  readonly timeNs: bigint;
  readonly width: number;
  /** Returns null after the copied surface's final reference is released. */
  acquire(): VideoPresentationLease | null;
}

export type VideoStreamPhase =
  | "idle"
  | "forward"
  | "seeking.locating"
  | "seeking.reading"
  | "seeking.prerolling"
  | "waiting-for-capacity"
  | "waiting-for-keyframe"
  | "faulted"
  | "closed";

/** Diagnostic safe to surface in a panel without source payload details. */
export interface VideoStreamDiagnostic {
  readonly code:
    | "capacity"
    | "closed"
    | "decode"
    | "dependency"
    | "read-budget"
    | "unsupported";
  readonly message: string;
  readonly severity: "info" | "error";
}

/** Observable stream state. Seeking never clears the last honest presentation. */
export interface VideoStreamSnapshot {
  readonly diagnostic: VideoStreamDiagnostic | null;
  readonly generation: number;
  readonly phase: VideoStreamPhase;
  readonly presentation: VideoPresentation | null;
  readonly presentedTimeNs: bigint | null;
  readonly targetTimeNs: bigint | null;
}

export type VideoIntentPriority = "background" | "visible" | "playing";

/** Shared ordering for admission and latest-intent conflation. */
export const VIDEO_INTENT_PRIORITY_WEIGHT: Readonly<
  Record<VideoIntentPriority, number>
> = {
  background: 0,
  visible: 1,
  playing: 2,
};

/** Latest-wins playback intent from one or more mounted consumers. */
export interface VideoPlaybackIntent extends H264AccessUnit {
  readonly priority: VideoIntentPriority;
}

export interface VideoReadBudget {
  readonly deadlineMs: number;
  readonly maxMessages: number;
  readonly maxObservedPayloadBytes: number;
}

export interface VideoAccessUnitReadResult {
  readonly complete: boolean;
  readonly stopReason?: string;
  readonly units: readonly H264AccessUnit[];
}

/** Framework-independent read boundary supplied by SourcePlayback. */
export interface VideoAccessUnitReader {
  readonly timelineStartTimeNs: bigint | null;
  read(options: {
    readonly budget: VideoReadBudget;
    readonly endTimeNs: bigint;
    readonly signal: AbortSignal;
    readonly startTimeNs: bigint;
    readonly stream: string;
  }): Promise<VideoAccessUnitReadResult>;
}

/** Small interface that lets the engine use real or fake WebCodecs actors. */
export interface VideoDecoderActor {
  readonly configuredCodec: string | null;
  /** Furthest decode-order timestamp submitted in the current codec epoch. */
  readonly cursorDecodeTimeNs: bigint | null;
  readonly cursorTimeNs: bigint | null;
  close(): void;
  /**
   * Resolves with a frame owned by the caller, which must close it. On
   * rejection the actor closes every decoder output it produced.
   */
  decode(
    units: readonly H264AccessUnit[],
    options: {
      readonly signal: AbortSignal;
      readonly targetTimeNs: bigint;
    },
  ): Promise<VideoFrame>;
  resetForDiscontinuity(): void;
}

export interface VideoEngineDependencies {
  readonly createDecoder: () => VideoDecoderActor;
  /** Takes ownership of `frame` and must close it on success or rejection. */
  readonly copyPresentation: (
    frame: VideoFrame,
    timeNs: bigint,
  ) => Promise<OwnedVideoPresentation>;
  readonly nowMs: () => number;
}

/** Engine-owned reference released on replacement or source close. */
export interface OwnedVideoPresentation extends VideoPresentation {
  releaseOwner(): void;
}

export class VideoIntentCancelledError extends Error {
  constructor() {
    super("Video playback intent was superseded");
    setErrorName(this, "VideoIntentCancelledError");
  }
}

export class VideoDependencyWaitError extends Error {
  constructor(message: string) {
    super(message);
    setErrorName(this, "VideoDependencyWaitError");
  }
}

export class VideoDecoderFailureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    setErrorName(this, "VideoDecoderFailureError");
  }
}

export class VideoSchedulerClosedError extends Error {
  constructor() {
    super("Video scheduler closed");
    setErrorName(this, "VideoSchedulerClosedError");
  }
}

/** Defines an own name even when the host freezes Error.prototype. */
function setErrorName(error: Error, name: string): void {
  Object.defineProperty(error, "name", { configurable: true, value: name });
}
