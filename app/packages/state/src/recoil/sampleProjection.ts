/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Frontend field partition: the dataset schema is split so the GRID requests
 * `fieldsForOverlay` and the MODAL requests the rest (full minus vectors/logits).
 * The backend is a thin projector — it never decides what to fetch.
 */
import {
  CLASSIFICATIONS_FIELD,
  CLASSIFICATION_FIELD,
  DETECTIONS_FIELD,
  DETECTION_FIELD,
  GEO_LOCATIONS_FIELD,
  GEO_LOCATION_FIELD,
  HEATMAP_FIELD,
  KEYPOINTS_FIELD,
  KEYPOINT_FIELD,
  POLYLINES_FIELD,
  POLYLINE_FIELD,
  REGRESSION_FIELD,
  type Schema,
  SEGMENTATION_FIELD,
  TEMPORAL_DETECTIONS_FIELD,
  TEMPORAL_DETECTION_FIELD,
  VECTOR_FIELD,
} from "@fiftyone/utilities";
import { selector } from "recoil";
import { fullSchema } from "./schema";

// label container types → their list subfield (db) name; single labels are absent
const LABEL_LIST_FIELD: Record<string, string> = {
  [DETECTIONS_FIELD]: "detections",
  [CLASSIFICATIONS_FIELD]: "classifications",
  [KEYPOINTS_FIELD]: "keypoints",
  [POLYLINES_FIELD]: "polylines",
  [TEMPORAL_DETECTIONS_FIELD]: "detections",
  [GEO_LOCATIONS_FIELD]: "geometries",
};

const SINGLE_LABELS = new Set([
  DETECTION_FIELD,
  CLASSIFICATION_FIELD,
  SEGMENTATION_FIELD,
  HEATMAP_FIELD,
  KEYPOINT_FIELD,
  POLYLINE_FIELD,
  TEMPORAL_DETECTION_FIELD,
  REGRESSION_FIELD,
  GEO_LOCATION_FIELD,
]);

const isLabel = (docType: string | null | undefined): boolean =>
  !!docType && (docType in LABEL_LIST_FIELD || SINGLE_LABELS.has(docType));

// overlay-rendering attributes (db names) the grid needs per label element; the
// label's `_id`/`_cls` are added so labels deserialize on the client
const OVERLAY_LEAVES = [
  "_id",
  "_cls",
  "label",
  "bounding_box",
  "points",
  "mask",
  "mask_path",
  "map",
  "map_path",
  "range",
  "index",
  "instance",
  "closed",
  "filled",
  "support",
];

// sample/frame identifier + media fields the response always needs (cache key,
// layout, media signing) — included in every request
const IDENTIFIERS = [
  "_id",
  "_cls",
  "filepath",
  "_media_type",
  "metadata",
  "tags",
  "_group",
  "_group_count",
  "support",
  "_sample_id",
  "frame_number",
];

const dbPath = (field: { dbField?: string | null; name: string }): string =>
  field.dbField || field.name;

const labelOverlayPaths = (path: string, docType: string): string[] => {
  const out = [`${path}._cls`];
  const listField = LABEL_LIST_FIELD[docType];
  const base = listField ? `${path}.${listField}` : path;
  for (const leaf of OVERLAY_LEAVES) {
    out.push(`${base}.${leaf}`);
  }
  return out;
};

const walk = (
  schema: Schema,
  prefix: string,
  overlay: string[],
  vectorExclude: string[]
) => {
  for (const name of Object.keys(schema)) {
    const field = schema[name];
    const path = prefix ? `${prefix}.${dbPath(field)}` : dbPath(field);

    if (isLabel(field.embeddedDocType)) {
      // grid overlay subpaths; modal excludes only the label's logits (vector)
      overlay.push(...labelOverlayPaths(path, field.embeddedDocType));
      const listField = LABEL_LIST_FIELD[field.embeddedDocType];
      vectorExclude.push(
        listField ? `${path}.${listField}.logits` : `${path}.logits`
      );
      continue;
    }

    if (field.ftype === VECTOR_FIELD) {
      vectorExclude.push(path);
      continue;
    }

    // recurse into the video frame document so frame labels are partitioned too
    if (name === "frames" && field.fields) {
      walk(field.fields, "frames", overlay, vectorExclude);
    }
  }
};

/**
 * The include list the GRID sends: overlay label subfields + media + identifiers
 * (+ the dynamic group-by/order fields appended by the caller that knows them).
 */
export const gridSampleFields = selector<string[]>({
  key: "gridSampleFields",
  get: ({ get }) => {
    const schema = get(fullSchema);
    const overlay: string[] = [];
    walk(schema, "", overlay, []);
    // NOTE: this is the field list the GRID overlays (and imavid playback) fetch.
    // It currently includes mask/mask_path (the `OVERLAY_LEAVES`), so mask blobs are
    // fetched INLINE with the rest of the overlay data. After the backend sample EAV
    // refactor, masks should be split out as standalone BLOBS fetched by id in
    // parallel (like the frame images) and render-joined — NOT carried inline here.
    // Until then, decoupling masks client-side is ineffective (same bytes, re-fetched).
    return Array.from(new Set([...IDENTIFIERS, ...overlay]));
  },
});

/**
 * The exclude list the MODAL sends: only VectorField + `logits` paths, so the
 * modal sample is the full sample minus those (all other label attributes,
 * dicts, primitives and metadata are returned).
 */
export const modalSampleExclude = selector<string[]>({
  key: "modalSampleExclude",
  get: ({ get }) => {
    const schema = get(fullSchema);
    const vectorExclude: string[] = [];
    walk(schema, "", [], vectorExclude);
    return Array.from(new Set(vectorExclude));
  },
});
