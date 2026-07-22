import type { Quaternion, Vector3 } from "three";

export type McapFrameTransformResolutionMode = "interpolate" | "hold-last";

export interface McapFrameTransformPolicy {
  readonly boundaryClampNs: bigint;
  readonly maxInterpolationGapNs: bigint;
  readonly resolutionMode?: McapFrameTransformResolutionMode;
}

export type McapFrameTransformResolutionKind =
  | "identity"
  | "static"
  | "exact"
  | "interpolated"
  | "held"
  | "clamped";

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
  readonly samples: readonly McapFrameTransformSample[];
  readonly topicStats?: readonly McapFrameTransformTopicStats[];
  readonly topics?: readonly string[];
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
  readonly samples: readonly McapFrameTransformSampleWire[];
  readonly topicStats?: readonly McapFrameTransformTopicStats[];
  readonly topics?: readonly string[];
}

export interface McapComposedFrameTransform {
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
