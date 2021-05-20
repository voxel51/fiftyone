/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import ClassificationsOverlay from "./classifications";
import DetectionOverlay from "./detection";
import KeypointOverlay from "./keypoint";
import PolylineOverlay from "./polyline";
import SegmentationOverlay from "./segmentation";

const fromLabel = (overlayType) => (
  field,
  label,
  renderer,
  frameNumber = null
) => [new overlayType(field, label, renderer, frameNumber)];

const fromLabelList = (overlayType, list_key) => (
  field,
  labels,
  renderer,
  frameNumber = null
) =>
  labels[list_key].map(
    (label) => new overlayType(field, label, renderer, frameNumber)
  );

export { ClassificationsOverlay };

export const FROM_FO = {
  Detection: fromLabel(DetectionOverlay),
  Detections: fromLabelList(DetectionOverlay, "detections"),
  Keypoint: fromLabel(KeypointOverlay),
  Keypoints: fromLabelList(KeypointOverlay, "keypoints"),
  Polyline: fromLabel(PolylineOverlay),
  PoylinesOverlay: fromLabelList(PolylineOverlay, "polylines"),
  Segmentation: fromLabel(SegmentationOverlay),
};
