import type { Quaternion, Vector3 } from "three";

export interface McapFrameTransformPolicy {
  readonly boundaryClampNs: bigint;
  readonly maxInterpolationGapNs: bigint;
}

export type McapFrameTransformResolutionKind =
  | "identity"
  | "static"
  | "exact"
  | "interpolated"
  | "clamped";

/**
 * Transform sample from a child frame into its parent frame.
 *
 * The rotation/translation use THREE math types. Note: when a set crosses a
 * worker boundary, structured clone strips THREE prototypes — receivers must
 * `hydrateMcapFrameTransformSet` to re-wrap before reading instance methods.
 */
export interface McapFrameTransformSample {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly rotation: Quaternion;
  readonly timeNs?: bigint;
  readonly translation: Vector3;
}

export interface McapFrameTransformTopicStats {
  readonly encodedPayloadBytes: number;
  readonly messageCount: number;
  readonly topic: string;
}

/**
 * Frame transform samples returned by one MCAP resource read.
 */
export interface McapFrameTransformSet {
  readonly encodedPayloadBytes?: number;
  readonly messageCount?: number;
  readonly samples: readonly McapFrameTransformSample[];
  readonly topicStats?: readonly McapFrameTransformTopicStats[];
  readonly topics?: readonly string[];
}

/**
 * Plain quaternion shape safe to send through structured clone.
 */
export interface McapQuaternionWire {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Plain vector shape safe to send through structured clone.
 */
export interface McapVector3Wire {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Serialized frame transform sample used across worker boundaries.
 */
export interface McapFrameTransformSampleWire {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly rotation: McapQuaternionWire;
  readonly timeNs?: bigint;
  readonly translation: McapVector3Wire;
}

/**
 * Serialized frame transform set used across worker boundaries.
 */
export interface McapFrameTransformSetWire {
  readonly encodedPayloadBytes?: number;
  readonly messageCount?: number;
  readonly samples: readonly McapFrameTransformSampleWire[];
  readonly topicStats?: readonly McapFrameTransformTopicStats[];
  readonly topics?: readonly string[];
}

/**
 * Composed transform mapping coordinates from sourceFrameId into targetFrameId.
 */
export interface McapComposedFrameTransform {
  /**
   * Largest bracketing sample gap used by any interpolated dynamic edge in
   * this composed path. Undefined when the path did not interpolate.
   */
  readonly maxInterpolationGapNs?: bigint;
  readonly resolutionKind?: McapFrameTransformResolutionKind;
  readonly rotation: Quaternion;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
  readonly translation: Vector3;
}

/**
 * Result of mapping coordinates from one frame into another frame.
 */
export type McapFrameTransformResolution = {
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
} & (
  | {
      readonly maxInterpolationGapNs?: bigint;
      readonly resolutionKind?: McapFrameTransformResolutionKind;
      readonly status: "resolved";
      readonly transform: McapComposedFrameTransform;
    }
  | {
      readonly status: "pending" | "missing";
      readonly transform?: undefined;
    }
);

/**
 * Inclusive dynamic timeline range already attempted by the transform hook.
 */
export interface McapFrameTransformTimeRange {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}
