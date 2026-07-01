import type { Quaternion, Vector3 } from "three";

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

/**
 * Frame transform samples returned by one MCAP resource read.
 */
export interface McapFrameTransformSet {
  readonly samples: readonly McapFrameTransformSample[];
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
  readonly samples: readonly McapFrameTransformSampleWire[];
}

/**
 * Composed transform mapping coordinates from sourceFrameId into targetFrameId.
 */
export interface McapComposedFrameTransform {
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
