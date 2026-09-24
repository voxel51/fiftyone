/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { createId } from "../utils";
import type { JSONObject } from "./types";

/**
 * Builders for FiftyOne label documents, passed to `withSampleData` and
 * `withFrameData` as `helpers.label`. Each stamps the identity fields and
 * takes the label's own fields under their stored names.
 *
 * @example
 * withFrameData: (_, { label }) => ({
 *   detections: label.detections([
 *     label.detection({
 *       label: "car",
 *       bounding_box: [0.3, 0.3, 0.2, 0.2],
 *       index: 1,
 *       instance: label.instance("car-1"),
 *     }),
 *   ]),
 * })
 */
export interface LabelBuilders {
  /** A `Detection`; a 3D cuboid passes `location`, `dimensions`, `rotation`. */
  detection(fields: JSONObject): JSONObject;
  /** A `Detections` list field holding `items`. */
  detections(items: JSONObject[]): JSONObject;
  /** A `Polyline`; a 3D polyline passes `points3d` segments and empty `points`. */
  polyline(fields: JSONObject): JSONObject;
  /** A `Polylines` list field holding `items`. */
  polylines(items: JSONObject[]): JSONObject;
  /** A `Classification`. */
  classification(fields: JSONObject): JSONObject;
  /** A `Classifications` list field holding `items`. */
  classifications(items: JSONObject[]): JSONObject;
  /** A `TemporalDetection` with a `[first, last]` frame `support`. */
  temporalDetection(fields: JSONObject): JSONObject;
  /** A `TemporalDetections` list field holding `items`. */
  temporalDetections(items: JSONObject[]): JSONObject;
  /** The same `Instance` for the same key, so a track's frames share identity. */
  instance(key: string): JSONObject;
}

const document = (cls: string, fields: JSONObject): JSONObject => ({
  _id: createId(),
  _cls: cls,
  tags: [],
  ...fields,
});

const list = (cls: string, field: string, items: JSONObject[]): JSONObject => ({
  _cls: cls,
  [field]: items,
});

/** Builders whose `instance` identities live for one dataset build. */
export const makeLabelBuilders = (): LabelBuilders => {
  const instances = new Map<string, JSONObject>();

  return {
    detection: (fields) => document("Detection", fields),
    detections: (items) => list("Detections", "detections", items),
    polyline: (fields) => document("Polyline", fields),
    polylines: (items) => list("Polylines", "polylines", items),
    classification: (fields) => document("Classification", fields),
    classifications: (items) =>
      list("Classifications", "classifications", items),
    temporalDetection: (fields) => document("TemporalDetection", fields),
    temporalDetections: (items) =>
      list("TemporalDetections", "detections", items),
    instance: (key) => {
      let instance = instances.get(key);
      if (!instance) {
        instance = { _id: createId(), _cls: "Instance" };
        instances.set(key, instance);
      }
      return instance;
    },
  };
};
