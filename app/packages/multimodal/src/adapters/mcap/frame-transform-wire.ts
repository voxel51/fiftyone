import { Quaternion, Vector3 } from "three";

import type {
  McapFrameTransformSample,
  McapFrameTransformSet,
  McapFrameTransformSetWire,
} from "./frame-transform-types";

/** Converts THREE-backed adapter values to structured-clone-safe wire data. */
export function dehydrateMcapFrameTransformSet(
  set: McapFrameTransformSet,
): McapFrameTransformSetWire {
  return {
    ...(set.encodedPayloadBytes !== undefined
      ? { encodedPayloadBytes: set.encodedPayloadBytes }
      : {}),
    ...(set.messageCount !== undefined
      ? { messageCount: set.messageCount }
      : {}),
    samples: set.samples.map((sample) => ({
      ...sample,
      rotation: {
        w: sample.rotation.w,
        x: sample.rotation.x,
        y: sample.rotation.y,
        z: sample.rotation.z,
      },
      translation: {
        x: sample.translation.x,
        y: sample.translation.y,
        z: sample.translation.z,
      },
    })),
    ...(set.topicStats !== undefined ? { topicStats: set.topicStats } : {}),
    ...(set.topics !== undefined ? { topics: set.topics } : {}),
  };
}

/** Rehydrates transform wire data received from an adapter worker. */
export function hydrateMcapFrameTransformSet(
  set: McapFrameTransformSetWire,
): McapFrameTransformSet {
  return {
    ...(set.encodedPayloadBytes !== undefined
      ? { encodedPayloadBytes: set.encodedPayloadBytes }
      : {}),
    ...(set.messageCount !== undefined
      ? { messageCount: set.messageCount }
      : {}),
    samples: set.samples.map((sample) => ({
      ...sample,
      rotation: new Quaternion(
        sample.rotation.x,
        sample.rotation.y,
        sample.rotation.z,
        sample.rotation.w,
      ).normalize(),
      translation: new Vector3(
        sample.translation.x,
        sample.translation.y,
        sample.translation.z,
      ),
    })),
    ...(set.topicStats !== undefined ? { topicStats: set.topicStats } : {}),
    ...(set.topics !== undefined ? { topics: set.topics } : {}),
  };
}

export function frameTransformEdgeKey(sample: {
  readonly childFrameId: string;
  readonly parentFrameId: string;
}): string {
  return `${sample.parentFrameId}\0${sample.childFrameId}`;
}

export function compareFrameTransformSamplesByTime(
  left: Pick<McapFrameTransformSample, "timeNs">,
  right: Pick<McapFrameTransformSample, "timeNs">,
): number {
  if (left.timeNs === right.timeNs) return 0;
  if (left.timeNs === undefined) return -1;
  if (right.timeNs === undefined) return 1;
  return left.timeNs < right.timeNs ? -1 : 1;
}
