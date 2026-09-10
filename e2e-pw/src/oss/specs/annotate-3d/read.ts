/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { JSONObject } from "src/shared/dataset-factory";

const labelList = (
  sample: JSONObject,
  field: string,
  list: string,
): JSONObject[] =>
  ((sample[field] as JSONObject | null | undefined)?.[list] as
    | JSONObject[]
    | undefined) ?? [];

/** The `label` of every cuboid `Detection` on a raw sample document. */
export const cuboidLabels = (sample: JSONObject, field = "detections") =>
  labelList(sample, field, "detections").map((label) => label.label as string);

/** The `label` of every `Polyline` on a raw sample document. */
export const polylineLabels = (sample: JSONObject, field = "polylines") =>
  labelList(sample, field, "polylines").map((label) => label.label as string);

export interface CuboidGeometry {
  location: number[] | null;
  dimensions: number[] | null;
  rotation: number[] | null;
}

/** The 3D geometry of the first cuboid `Detection` on a raw sample document. */
export const cuboidGeometry = (
  sample: JSONObject,
  field = "detections",
): CuboidGeometry => {
  const cuboid = labelList(sample, field, "detections")[0];
  return {
    location: (cuboid?.location as number[] | undefined) ?? null,
    dimensions: (cuboid?.dimensions as number[] | undefined) ?? null,
    rotation: (cuboid?.rotation as number[] | undefined) ?? null,
  };
};

/**
 * The first cuboid `Detection` on a raw sample document with private keys
 * stripped (except `_cls`). Use to verify user attributes — including ones
 * whose names collide with UI bookkeeping (`type`, `color`, `isNew`) —
 * round-trip to the DB, and that no view-state bookkeeping leaked in.
 */
export const cuboidDocument = (
  sample: JSONObject,
  field = "detections",
): JSONObject | null => {
  const cuboid = labelList(sample, field, "detections")[0];
  if (!cuboid) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(cuboid).filter(
      ([key]) => key === "_cls" || !key.startsWith("_"),
    ),
  );
};

export interface PolylineGeometry {
  points3d: number[][][] | null;
  closed: boolean | null;
  filled: boolean | null;
}

/** The 3D geometry of the first `Polyline` on a raw sample document. */
export const polylineGeometry = (
  sample: JSONObject,
  field = "polylines",
): PolylineGeometry => {
  const polyline = labelList(sample, field, "polylines")[0];
  return {
    points3d: (polyline?.points3d as number[][][] | undefined) ?? null,
    closed: polyline ? Boolean(polyline.closed) : null,
    filled: polyline ? Boolean(polyline.filled) : null,
  };
};
