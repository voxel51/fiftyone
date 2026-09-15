import type {
  EncodedAv1VideoVisualization,
  EncodedH264VideoVisualization,
  EncodedHevcVideoVisualization,
  EncodedVideoCodec,
  EncodedVideoVisualization,
} from "../ir";

/** One timestamped encoded-video access unit owned by the video engine. */
export interface EncodedVideoAccessUnit {
  readonly frame: EncodedVideoVisualization;
  readonly timeNs: bigint;
}

/** H.264 specialization retained for codec-specific producers and tests. */
export interface H264AccessUnit extends EncodedVideoAccessUnit {
  readonly frame: EncodedH264VideoVisualization;
}

/** Codec subset implemented by the shared synchronized WebCodecs pipeline. */
export type SharedEncodedVideoVisualization =
  | EncodedH264VideoVisualization
  | EncodedAv1VideoVisualization
  | EncodedHevcVideoVisualization;

/** User-facing codec names; blank where only the format string identifies it. */
const VIDEO_CODEC_LABEL: Readonly<Record<EncodedVideoCodec, string>> = {
  av1: "AV1",
  h264: "H.264",
  h265: "HEVC",
  unknown: "",
  vp9: "VP9",
};

/** Whether the shared synchronized decoder supports this encoded frame. */
export function isSharedEncodedVideoVisualization(
  frame: EncodedVideoVisualization,
): frame is SharedEncodedVideoVisualization {
  if (frame.undecodable) return false;
  return (
    frame.codec === "av1" ||
    (frame.codec === "h264" &&
      frame.h264 !== undefined &&
      frame.h264.hasFrame !== false) ||
    frame.codec === "h265"
  );
}

/** How an encoded frame's codec reads in user-facing copy. */
export function encodedVideoCodecName(
  frame: EncodedVideoVisualization,
): string {
  const label = VIDEO_CODEC_LABEL[frame.codec];
  return label || frame.format || "unrecognized";
}

/** Codecs the advice can name, so it never suggests transcoding to itself. */
const TRANSCODE_TARGETS: ReadonlySet<EncodedVideoCodec> = new Set([
  "av1",
  "h264",
]);

/**
 * Explains why an encoded frame rejected by shared playback is unavailable.
 * Names the exact codec string: "unsupported" without it leaves the user
 * guessing whether the file is broken, slow, or simply the wrong encoding.
 */
export function sharedVideoRejectionMessage(
  frame: EncodedVideoVisualization,
): string {
  if (frame.codec === "h264" && frame.h264?.hasFrame === false) {
    return "H.264 video frame data is unavailable";
  }
  return unsupportedVideoCodecMessage(frame.format, frame.codec);
}

/** The refusal copy for a codec string, with no frame needed to carry it. */
export function unsupportedVideoCodecMessage(
  codecString: string,
  codec?: EncodedVideoCodec,
): string {
  const family = codec ?? "unknown";
  const label = VIDEO_CODEC_LABEL[family];
  const named = label
    ? `${label} video ('${codecString}')`
    : `Video codec '${codecString}'`;
  // A refused H.264 or AV1 stream is a refused profile, not a refused family
  const advice = TRANSCODE_TARGETS.has(family)
    ? "Re-encode this camera at a more widely supported profile to view it."
    : "Transcode this camera to H.264 or AV1 to view it.";
  return `${named} cannot be decoded in this browser. ${advice}`;
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
export interface VideoPlaybackIntent extends EncodedVideoAccessUnit {
  readonly priority: VideoIntentPriority;
}

export interface VideoReadBudget {
  readonly maxWallTimeMs: number;
  readonly maxMessages: number;
  readonly maxObservedPayloadBytes: number;
}

export interface VideoAccessUnitReadResult {
  readonly complete: boolean;
  readonly stopReason?: string;
  readonly units: readonly EncodedVideoAccessUnit[];
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
    units: readonly EncodedVideoAccessUnit[],
    options: {
      readonly signal: AbortSignal;
      readonly targetTimeNs: bigint;
    },
  ): Promise<VideoFrame>;
  /** Whether an explicitly reordered presentation is decoded and ready now. */
  hasReadyPresentation(timeNs: bigint): boolean;
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
  Object.defineProperty(error, "name", {
    configurable: true,
    value: name,
    writable: true,
  });
}
