/** Stable visual artifact kinds emitted by decoders. */
export const VISUALIZATION_KIND = Object.freeze({
  CAMERA_CALIBRATION: "camera-calibration",
  ENCODED_IMAGE: "encoded-image",
  ENCODED_VIDEO: "encoded-video",
  GRID: "grid",
  IMAGE_ANNOTATIONS: "image-annotations",
  LOCATION: "location",
  POINT_CLOUD: "point-cloud",
  POSE: "pose",
  RAW_IMAGE: "raw-image",
  SCENE_UPDATE: "scene-update",
} as const);

/** Union of visualization kind identifiers in the frame IR. */
export type VisualizationKind =
  (typeof VISUALIZATION_KIND)[keyof typeof VISUALIZATION_KIND];
