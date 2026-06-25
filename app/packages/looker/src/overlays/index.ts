/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import {
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  getCls,
  getFieldInfo,
  LABEL_LISTS_MAP,
  Schema,
} from "@fiftyone/utilities";
import { LABEL_TAGS_CLASSES } from "../constants";
import { BaseState } from "../state";
import { Overlay } from "./base";
import {
  ClassificationLabel,
  ClassificationsOverlay,
  Labels,
  TemporalDetectionLabel,
  TemporalDetectionOverlay,
} from "./classifications";
import DetectionOverlay, { getDetectionPoints } from "./detection";
import HeatmapOverlay, { getHeatmapPoints } from "./heatmap";
import KeypointOverlay, { getKeypointPoints } from "./keypoint";
import PolylineOverlay, { getPolylinePoints } from "./polyline";
import SegmentationOverlay, { getSegmentationPoints } from "./segmentation";

export * from "./base";
export * from "./classifications";
export * from "./detection";
export * from "./heatmap";
export * from "./keypoint";
export * from "./polyline";
export * from "./segmentation";
export * from "./util";

export const fromLabel = (overlayType) => (field, label) =>
  label ? [new overlayType(field, label)] : [];

export const fromLabelList = (overlayType, list_key) => (field, labels) =>
  labels?.[list_key]?.map((label) => new overlayType(field, label)) ?? [];

export { ClassificationsOverlay };

// the overlay class that renders each label docType. `LABEL_LISTS_MAP` supplies the
// list subfield for the plural types, so this map is the single source of truth for
// the docType -> overlay relationship (the factory and the fetched-fields list below
// both derive from it and therefore can't drift)
const OVERLAY_BY_CLS: Record<string, { getRenderFields(): string[] }> = {
  Detection: DetectionOverlay,
  Detections: DetectionOverlay,
  Heatmap: HeatmapOverlay,
  Keypoint: KeypointOverlay,
  Keypoints: KeypointOverlay,
  Polyline: PolylineOverlay,
  Polylines: PolylineOverlay,
  Segmentation: SegmentationOverlay,
  Classification: ClassificationsOverlay,
  Classifications: ClassificationsOverlay,
  Regression: ClassificationsOverlay,
  TemporalDetection: TemporalDetectionOverlay,
  TemporalDetections: TemporalDetectionOverlay,
};

// the docTypes whose overlays are instantiated one-per-label (the classification
// family is accumulated into a single overlay in `loadOverlays` instead)
const COORDINATE_CLSES = [
  "Detection",
  "Detections",
  "Heatmap",
  "Keypoint",
  "Keypoints",
  "Polyline",
  "Polylines",
  "Segmentation",
];

export const FROM_FO = Object.fromEntries(
  COORDINATE_CLSES.map((cls) => {
    const overlay = OVERLAY_BY_CLS[cls];
    const listKey = LABEL_LISTS_MAP[cls];
    return [
      cls,
      listKey ? fromLabelList(overlay, listKey) : fromLabel(overlay),
    ];
  })
);

/**
 * The db field paths required to render a sample's overlays, derived from the
 * schema and each overlay's `getRenderFields`. This is what the grid requests:
 * exactly the leaves the renderers read, nothing else.
 */
export const getRenderFieldPaths = (schema: Schema): string[] => {
  const paths = new Set<string>();

  const visit = (fields: Schema, prefix: string) => {
    for (const name in fields) {
      const field = fields[name];
      const path = prefix
        ? `${prefix}.${field.dbField || field.name}`
        : field.dbField || field.name;
      const cls = field.embeddedDocType?.split(".").slice(-1)[0];
      const overlay = cls ? OVERLAY_BY_CLS[cls] : undefined;

      if (overlay) {
        const listKey = LABEL_LISTS_MAP[cls];
        const base = listKey ? `${path}.${listKey}` : path;
        for (const leaf of overlay.getRenderFields()) {
          paths.add(`${base}.${leaf}`);
        }
        continue;
      }

      // descend non-label embedded docs (incl. the `frames` document) to reach
      // labels nested within them
      if (field.fields) {
        visit(field.fields, path);
      }
    }
  };

  visit(schema, "");

  // video frame overlays are keyed by frame number
  if (schema.frames?.fields) {
    paths.add("frames.frame_number");
  }

  return Array.from(paths);
};

export const POINTS_FROM_FO = {
  Detection: (label) => getDetectionPoints(label ? [label] : []),
  Detections: (label) => getDetectionPoints(label?.detections ?? []),
  Heatmap: (label) => getHeatmapPoints(label ? [label] : []),
  Keypoint: (label) => getKeypointPoints(label ? [label] : []),
  Keypoints: (label) => getKeypointPoints(label?.keypoints ?? []),
  Polyline: (label) => getPolylinePoints(label ? [label] : []),
  Poylines: (label) => getPolylinePoints(label?.polylines ?? []),
  Segmentation: (label) => getSegmentationPoints(label ? [label] : []),
};

const LABEL_LISTS = LABEL_LISTS_MAP;

export const loadOverlays = <State extends BaseState>(
  sample: {
    [key: string]: any;
  },
  schema: Schema,
  video = false
): Overlay<State>[] => {
  const { classifications, overlays } = accumulateOverlays(sample, schema);

  if (classifications.length > 0) {
    const overlay = video
      ? new TemporalDetectionOverlay(classifications)
      : new ClassificationsOverlay(classifications);
    overlays.push(overlay);
  }

  return overlays;
};

const TAGS = new Set(LABEL_TAGS_CLASSES);

const EMBEDDED_FIELDS = Object.freeze(
  new Set([EMBEDDED_DOCUMENT_FIELD, DYNAMIC_EMBEDDED_DOCUMENT_FIELD])
);

export const accumulateOverlays = <State extends BaseState>(
  data: {
    [key: string]: any;
  },
  schema: Schema,
  prefix = [],
  depth = 1
): {
  classifications: Labels<TemporalDetectionLabel | ClassificationLabel>;
  overlays: Overlay<State>[];
} => {
  const classifications = [];
  const overlays = [];
  for (const field in data) {
    const label = data[field];

    if (!label || Array.isArray(label)) {
      continue;
    }

    const path = [...prefix, field].join(".");
    const fieldInfo = getFieldInfo(path, schema);
    const docType = getCls(path, schema);

    if (docType in FROM_FO) {
      overlays.push(...FROM_FO[docType](path, label));
      continue;
    }
    if (TAGS.has(docType)) {
      classifications.push([
        path,
        docType in LABEL_LISTS ? label[LABEL_LISTS[docType]] : [label],
      ]);
      continue;
    }

    if (depth && EMBEDDED_FIELDS.has(fieldInfo?.ftype)) {
      const nestedResult = accumulateOverlays(
        label,
        schema,
        [...prefix, field],
        depth - 1
      );
      classifications.push(...nestedResult.classifications);
      overlays.push(...nestedResult.overlays);
    }
  }

  return { classifications, overlays };
};
