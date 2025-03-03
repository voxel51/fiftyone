/**
 * Copyright 2017-2025, Voxel51, Inc.
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

export type { PointInfo } from "./base";

export const fromLabel = (overlayType) => (field, label) =>
  label ? [new overlayType(field, label)] : [];

export const fromLabelList = (overlayType, list_key) => (field, labels) =>
  labels?.[list_key]?.map((label) => new overlayType(field, label)) ?? [];

export { ClassificationsOverlay };

export const FROM_FO = {
  Detection: fromLabel(DetectionOverlay),
  Detections: fromLabelList(DetectionOverlay, "detections"),
  Heatmap: fromLabel(HeatmapOverlay),
  Keypoint: fromLabel(KeypointOverlay),
  Keypoints: fromLabelList(KeypointOverlay, "keypoints"),
  Polyline: fromLabel(PolylineOverlay),
  Polylines: fromLabelList(PolylineOverlay, "polylines"),
  Segmentation: fromLabel(SegmentationOverlay),
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
