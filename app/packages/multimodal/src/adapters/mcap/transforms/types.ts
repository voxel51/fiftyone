import type { Quaternion, Vector3 } from "three";

export interface McapFrameTransformSample {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly rotation: Quaternion;
  /** Source topic retained for topology provenance. */
  readonly sourceName?: string;
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
  readonly sourceName?: string;
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
