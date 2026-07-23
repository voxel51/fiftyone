import type { Quaternion, Vector3 } from "three";

export interface EpisodeFrameTransformPolicy {
  readonly boundaryClampNs: bigint;
}

export type EpisodeFrameTransformResolutionKind =
  | "identity"
  | "static"
  | "exact"
  | "interpolated"
  | "held"
  | "clamped";

/** Why a dynamic edge is holding its latest recorded pose. */
export type EpisodeHeldFrameTransformReason =
  | "after-last-sample"
  | "interpolation-gap"
  | "parent-change";

/**
 * One dynamic edge whose latest recorded pose is being reused at the query
 * time. Gap/limit fields are diagnostic only; user-facing status is derived
 * from the source timestamp and age.
 */
export interface EpisodeHeldFrameTransform {
  readonly ageNs: bigint;
  readonly interpolationGapLimitNs?: bigint;
  readonly interpolationGapNs?: bigint;
  readonly reason: EpisodeHeldFrameTransformReason;
  readonly sourceFrameId: string;
  readonly sourceTimeNs: bigint;
  readonly staleAfterNs: bigint;
  readonly targetFrameId: string;
}

/**
 * Transform sample from a child frame into its parent frame.
 *
 * The rotation/translation use THREE math types. Note: when a set crosses a
 * worker boundary, structured clone strips THREE prototypes — receivers must
 * `hydrateEpisodeFrameTransformSet` to re-wrap before reading instance methods.
 */
export interface EpisodeFrameTransformSample {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly rotation: Quaternion;
  readonly timeNs?: bigint;
  readonly translation: Vector3;
}

export interface EpisodeFrameTransformStreamStats {
  readonly encodedPayloadBytes: number;
  readonly messageCount: number;
  readonly stream: string;
}

/**
 * Frame transform samples returned by one episode resource read.
 */
export interface EpisodeFrameTransformSet {
  readonly encodedPayloadBytes?: number;
  readonly messageCount?: number;
  readonly samples: readonly EpisodeFrameTransformSample[];
  readonly streamStats?: readonly EpisodeFrameTransformStreamStats[];
  readonly streams?: readonly string[];
}

/**
 * Plain quaternion shape safe to send through structured clone.
 */
export interface EpisodeQuaternionWire {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Plain vector shape safe to send through structured clone.
 */
export interface EpisodeVector3Wire {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Serialized frame transform sample used across worker boundaries.
 */
export interface EpisodeFrameTransformSampleWire {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly rotation: EpisodeQuaternionWire;
  readonly timeNs?: bigint;
  readonly translation: EpisodeVector3Wire;
}

/**
 * Serialized frame transform set used across worker boundaries.
 */
export interface EpisodeFrameTransformSetWire {
  readonly encodedPayloadBytes?: number;
  readonly messageCount?: number;
  readonly samples: readonly EpisodeFrameTransformSampleWire[];
  readonly streamStats?: readonly EpisodeFrameTransformStreamStats[];
  readonly streams?: readonly string[];
}

/**
 * Composed transform mapping coordinates from sourceFrameId into targetFrameId.
 */
export interface EpisodeComposedFrameTransform {
  /** Dynamic edges held at their latest recorded pose along this path. */
  readonly heldEdges?: readonly EpisodeHeldFrameTransform[];
  /**
   * Largest bracketing sample gap used by any interpolated dynamic edge in
   * this composed path. Undefined when the path did not interpolate.
   */
  readonly maxInterpolationGapNs?: bigint;
  readonly resolutionKind?: EpisodeFrameTransformResolutionKind;
  readonly rotation: Quaternion;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
  readonly translation: Vector3;
}

/**
 * Result of mapping coordinates from one frame into another frame.
 */
export type EpisodeFrameTransformResolution = {
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
} & (
  | {
      readonly heldEdges?: readonly EpisodeHeldFrameTransform[];
      readonly maxInterpolationGapNs?: bigint;
      readonly resolutionKind?: EpisodeFrameTransformResolutionKind;
      readonly status: "resolved";
      readonly transform: EpisodeComposedFrameTransform;
    }
  | {
      readonly status: "pending" | "missing";
      readonly transform?: undefined;
    }
);

/**
 * Inclusive dynamic timeline range already attempted by the transform hook.
 */
export interface EpisodeFrameTransformTimeRange {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}
