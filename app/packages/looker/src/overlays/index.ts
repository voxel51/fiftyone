/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import ClassificationsOverlay from "./classifications";
import DetectionOverlay, {
  DetectionSvgOverlay,
  getDetectionPoints,
} from "./detection";
import KeypointOverlay, { getKeypointPoints } from "./keypoint";
import PolylineOverlay, { getPolylinePoints } from "./polyline";
import SegmentationOverlay, { getSegmentationPoints } from "./segmentation";

const fromLabel = (overlayType) => (state, field, label) => [
  new overlayType(state, field, label),
];

const fromLabelList = (overlayType, list_key) => (state, field, labels) =>
  labels[list_key].map((label) => new overlayType(state, field, label));

export { ClassificationsOverlay };

export const FROM_FO = {
  Detection: fromLabel(DetectionSvgOverlay),
  Detections: fromLabelList(DetectionSvgOverlay, "detections"),
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
