import type { Quaternion, Vector3 } from "three";

export interface McapFrameTransformPolicy {
  readonly boundaryClampNs: bigint;
}

export type McapFrameTransformResolutionKind =
  | "identity"
  | "static"
  | "exact"
  | "interpolated"
  | "held"
  | "clamped";

/** Why a dynamic MCAP transform edge is holding its latest recorded pose. */
export type McapHeldFrameTransformReason =
  | "after-last-sample"
  | "interpolation-gap"
  | "parent-change";

/** Worker-safe metadata for one held dynamic transform edge. */
export interface McapHeldFrameTransform {
  readonly ageNs: bigint;
  readonly interpolationGapLimitNs?: bigint;
  readonly interpolationGapNs?: bigint;
  readonly reason: McapHeldFrameTransformReason;
  readonly sourceFrameId: string;
  readonly sourceTimeNs: bigint;
  readonly staleAfterNs: bigint;
  readonly targetFrameId: string;
}

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

export interface McapFrameTransformSet {
  readonly encodedPayloadBytes?: number;
  readonly messageCount?: number;
  readonly placementCoverage?: McapFrameTransformPlacementCoverage;
  readonly samples: readonly McapFrameTransformSample[];
  readonly topicStats?: readonly McapFrameTransformTopicStats[];
  readonly topics?: readonly string[];
}

/** Completeness proof for one exact-time dynamic placement query. */
export interface McapFrameTransformPlacementCoverage {
  readonly complete: boolean;
  readonly startTimeNs?: bigint;
}

export interface McapQuaternionWire {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface McapVector3Wire {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface McapFrameTransformSampleWire {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly rotation: McapQuaternionWire;
  readonly timeNs?: bigint;
  readonly translation: McapVector3Wire;
}

export interface McapFrameTransformSetWire {
  readonly encodedPayloadBytes?: number;
  readonly messageCount?: number;
  readonly placementCoverage?: McapFrameTransformPlacementCoverage;
  readonly samples: readonly McapFrameTransformSampleWire[];
  readonly topicStats?: readonly McapFrameTransformTopicStats[];
  readonly topics?: readonly string[];
}

export interface McapComposedFrameTransform {
  readonly heldEdges?: readonly McapHeldFrameTransform[];
  readonly maxInterpolationGapNs?: bigint;
  readonly resolutionKind?: McapFrameTransformResolutionKind;
  readonly rotation: Quaternion;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
  readonly translation: Vector3;
}

export type McapFrameTransformResolution = {
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
} & (
  | {
      readonly heldEdges?: readonly McapHeldFrameTransform[];
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

export interface McapFrameTransformTimeRange {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}
