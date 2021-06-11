/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { deserialize } from "../numpy";
import { BaseState } from "../state";
import { Overlay } from "./base";
import ClassificationsOverlay, {
  ClassificationLabels,
} from "./classifications";
import DetectionOverlay, { getDetectionPoints } from "./detection";
import KeypointOverlay, { getKeypointPoints } from "./keypoint";
import PolylineOverlay, { getPolylinePoints } from "./polyline";
import SegmentationOverlay, { getSegmentationPoints } from "./segmentation";

const fromLabel = (overlayType) => (field, label) => [
  new overlayType(field, label),
];

const fromLabelList = (overlayType, list_key) => (field, labels) =>
  labels[list_key].map((label) => new overlayType(field, label));

export { ClassificationsOverlay };

export const FROM_FO = {
  Detection: fromLabel(DetectionOverlay),
  Detections: fromLabelList(DetectionOverlay, "detections"),
  Keypoint: fromLabel(KeypointOverlay),
  Keypoints: fromLabelList(KeypointOverlay, "keypoints"),
  Polyline: fromLabel(PolylineOverlay),
  Poylines: fromLabelList(PolylineOverlay, "polylines"),
  Segmentation: fromLabel(SegmentationOverlay),
};

export const POINTS_FROM_FO = {
  Detection: (label) => getDetectionPoints([label]),
  Detections: (label) => getDetectionPoints(label.detections),
  Keypoint: (label) => getKeypointPoints([label]),
  Keypoints: (label) => getKeypointPoints(label.keypoints),
  Polyline: (label) => getPolylinePoints([label]),
  Poylines: (label) => getPolylinePoints(label.polylines),
  Segmentation: (label) => getSegmentationPoints([label]),
};

const DESERIALIZE = {
  Detection: (label) => {
    if (typeof label.mask === "string") {
      label.mask = deserialize(label.mask);
    } else {
      label.mask = null;
    }
  },
  Detections: (labels) => {
    labels.detections.forEach((label) => {
      if (typeof label.mask === "string") {
        label.mask = deserialize(label.mask);
      } else {
        label.mask = null;
      }
    });
  },
  Segmentation: (label) => {
    if (typeof label.mask === "string") {
      label.mask = deserialize(label.mask);
    } else {
      label.mask = null;
    }
  },
};

export const processMasks = <State extends BaseState>(sample: {
  [key: string]: any;
}): Overlay<State>[] => {
  for (const field in sample) {
    const label = sample[field];
    if (!label) {
      continue;
    }
    if (label._cls in DESERIALIZE) {
      DESERIALIZE[label._cls](field, label, this);
    }
  }

  return overlays;
};

export const loadOverlays = <State extends BaseState>(sample: {
  [key: string]: any;
}): Overlay<State>[] => {
  const classifications = <ClassificationLabels>[];
  let overlays = [];
  for (const field in sample) {
    const label = sample[field];
    if (!label) {
      continue;
    }
    if (label._cls in FROM_FO) {
      const labelOverlays = FROM_FO[label._cls](field, label, this);
      overlays = [...overlays, ...labelOverlays];
    } else if (label._cls === "Classification") {
      classifications.push([field, [label]]);
    } else if (label._cls === "Classifications") {
      classifications.push([field, label.classifications]);
    }
  }

  if (classifications.length > 0) {
    const overlay = new ClassificationsOverlay(classifications);
    overlays.push(overlay);
  }

  return overlays;
};
