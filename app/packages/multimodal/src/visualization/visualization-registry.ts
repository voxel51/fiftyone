// TODO: implement panel selection for visualization kinds.

/**
 * Stable visual artifact kinds emitted by decoders.
 */
export const VISUALIZATION_KIND = Object.freeze({
  CAMERA_CALIBRATION: "camera-calibration",
  ENCODED_IMAGE: "encoded-image",
  GRID: "grid",
  IMAGE_ANNOTATIONS: "image-annotations",
  LOCATION: "location",
  POINT_CLOUD: "point-cloud",
  POSE: "pose",
  SCENE_UPDATE: "scene-update",
} as const);

/**
 * App panel families capable of presenting decoded visual artifacts.
 */
export const PANEL_TYPE = Object.freeze({
  IMAGE: "image",
  MAP: "map",
  THREE_D: "3D",
  TIMESERIES: "timeseries",
} as const);

/**
 * Union of visualization kind ids.
 */
export type VisualizationKind =
  (typeof VISUALIZATION_KIND)[keyof typeof VISUALIZATION_KIND];

/**
 * Union of panel family ids.
 */
export type PanelType = (typeof PANEL_TYPE)[keyof typeof PANEL_TYPE];

/**
 * Visualization-to-panel registry.
 */
export const VISUALIZATION_PANEL_REGISTRY: Readonly<
  Record<VisualizationKind, PanelType>
> = Object.freeze({
  // Calibration is data, not imagery: its only renderable form is a camera
  // frustum in the 3D scene, so it maps to the 3D panel family.
  [VISUALIZATION_KIND.CAMERA_CALIBRATION]: PANEL_TYPE.THREE_D,
  [VISUALIZATION_KIND.ENCODED_IMAGE]: PANEL_TYPE.IMAGE,
  [VISUALIZATION_KIND.GRID]: PANEL_TYPE.THREE_D,
  [VISUALIZATION_KIND.IMAGE_ANNOTATIONS]: PANEL_TYPE.IMAGE,
  // No MAP panel exists yet; v1 surfaces locations as a 3D-tile HUD
  // readout. The mapping records the natural home for the data.
  [VISUALIZATION_KIND.LOCATION]: PANEL_TYPE.MAP,
  [VISUALIZATION_KIND.POINT_CLOUD]: PANEL_TYPE.THREE_D,
  [VISUALIZATION_KIND.POSE]: PANEL_TYPE.THREE_D,
  [VISUALIZATION_KIND.SCENE_UPDATE]: PANEL_TYPE.THREE_D,
});
