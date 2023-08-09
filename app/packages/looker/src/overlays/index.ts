/**
 * Copyright 2017-2023, Voxel51, Inc.
 */
import {
  DYNAMIC_EMBEDDED_DOCUMENT,
  LABEL_LISTS_MAP,
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

const fromLabel = (overlayType) => (field, label) =>
  [new overlayType(field, label)];

const fromLabelList = (overlayType, list_key) => (field, labels) =>
  labels[list_key].map((label) => new overlayType(field, label));

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
  Detection: (label) => getDetectionPoints([label]),
  Detections: (label) => getDetectionPoints(label.detections),
  Heatmap: (label) => getHeatmapPoints([label]),
  Keypoint: (label) => getKeypointPoints([label]),
  Keypoints: (label) => getKeypointPoints(label.keypoints),
  Polyline: (label) => getPolylinePoints([label]),
  Poylines: (label) => getPolylinePoints(label.polylines),
  Segmentation: (label) => getSegmentationPoints([label]),
};

export const loadOverlays = <State extends BaseState>(
  sample: {
    [key: string]: any;
  },
  video = false
): Overlay<State>[] => {
  const { classifications, overlays } = accumulateOverlays(sample);

  if (classifications.length > 0) {
    const overlay = video
      ? new TemporalDetectionOverlay(classifications)
      : new ClassificationsOverlay(classifications);
    overlays.push(overlay);
  }

  return overlays;
};

const accumulateOverlays = <State extends BaseState>(
  data: {
    [key: string]: any;
  },
  prefix = "",
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

    if (label._cls === DYNAMIC_EMBEDDED_DOCUMENT && depth) {
      const nestedResult = accumulateOverlays(label, `${field}.`, depth - 1);
      classifications.push(...nestedResult.classifications);
      overlays.push(...nestedResult.overlays);
      continue;
    }

    if (label._cls in FROM_FO) {
      const labelOverlays = FROM_FO[label._cls](
        `${prefix}${field}`,
        label,
        this
      );
      overlays.push(...labelOverlays);
    } else if (LABEL_TAGS_CLASSES.includes(label._cls)) {
      classifications.push([
        `${prefix}${field}`,
        label._cls in LABEL_LISTS_MAP
          ? label[LABEL_LISTS_MAP[label._cls]]
          : [label],
      ]);
    }
  }

  return { classifications, overlays };
};
