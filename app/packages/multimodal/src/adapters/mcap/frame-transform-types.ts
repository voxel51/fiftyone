import type { Quaternion, Vector3 } from "three";

/**
 * Hydrated transform sample used by the runtime resolver.
 */
export interface McapHydratedFrameTransformSample {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly rotation: Quaternion;
  readonly timeNs?: bigint;
  readonly translation: Vector3;
}

/**
 * Hydrated frame transform samples returned by resource clients.
 */
export interface McapHydratedFrameTransformSet {
  readonly samples: readonly McapHydratedFrameTransformSample[];
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
