/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { JSONObject } from "src/shared/dataset-factory";

/** One frame's label on a tracked frame field, as persisted. */
export interface FrameTrackLabel {
  frame: number;
  /** The cross-frame `instance._id` (the track key), or null. */
  instance: string | null;
  label: string | null;
  keyframe: boolean;
  /** A box or at least one polyline vertex is stored on the frame. */
  hasGeometry: boolean;
}

/**
 * Every label on a sample's tracked frame `field` (e.g. `detections`,
 * `polylines`), one row per frame, from the raw frame documents of
 * `datasetFactory.readFrames`. Use to verify a track edit (split / merge /
 * keyframe pin) round-tripped.
 */
export const frameTrackState = (
  frames: JSONObject[],
  field: string,
): FrameTrackLabel[] => {
  const rows: FrameTrackLabel[] = [];
  for (const frame of frames) {
    const container = frame[field] as JSONObject | null | undefined;
    if (!container) {
      continue;
    }
    for (const label of (container[field] as JSONObject[] | undefined) ?? []) {
      const instance = label.instance as
        | { _id: { $oid: string } }
        | null
        | undefined;
      const boundingBox = label.bounding_box as number[] | null | undefined;
      const points = label.points as number[][][] | null | undefined;
      rows.push({
        frame: frame.frame_number as number,
        instance: instance ? instance._id.$oid : null,
        label: (label.label as string | null | undefined) ?? null,
        keyframe: Boolean(label.keyframe),
        hasGeometry:
          (boundingBox?.length ?? 0) > 0 ||
          Boolean(points?.some((segment) => segment.length > 0)),
      });
    }
  }
  return rows;
};
