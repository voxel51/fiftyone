/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { LabelType } from "@fiftyone/utilities";

// A type is keyframeable iff linear propagation can interpolate its geometry.
// Keep in step with `linearAgentFor` in `propagation/propagationShapes`.
export const KEYFRAME_TYPES: ReadonlySet<LabelType> = new Set([
  LabelType.Detection,
  LabelType.Detections,
  LabelType.Polyline,
  LabelType.Polylines,
]);

// Split is a track-identity op, valid for any frame-level instance geometry we
// support as a track (detections + polylines), but not for TDs / classifications.
export const INSTANCE_TRACK_TYPES: ReadonlySet<LabelType> = new Set([
  LabelType.Detection,
  LabelType.Detections,
  LabelType.Polyline,
  LabelType.Polylines,
]);

export const TEMPORAL_TYPES: ReadonlySet<LabelType> = new Set([
  LabelType.TemporalDetection,
  LabelType.TemporalDetections,
]);

/** Membership equality so a selector only re-renders on an id set change. */
export const sameIds = (
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): boolean => {
  if (a.size !== b.size) {
    return false;
  }

  for (const id of a) {
    if (!b.has(id)) {
      return false;
    }
  }

  return true;
};
