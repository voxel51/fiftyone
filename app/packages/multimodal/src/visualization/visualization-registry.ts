import {
  VISUALIZATION_KIND,
  type VisualizationKind,
} from "../ir/visualization-kinds";

export { VISUALIZATION_KIND } from "../ir/visualization-kinds";
export type { VisualizationKind } from "../ir/visualization-kinds";

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
  [VISUALIZATION_KIND.ENCODED_VIDEO]: PANEL_TYPE.IMAGE,
  [VISUALIZATION_KIND.GRID]: PANEL_TYPE.THREE_D,
  [VISUALIZATION_KIND.IMAGE_ANNOTATIONS]: PANEL_TYPE.IMAGE,
  // No MAP panel exists yet; locations currently surface as a 3D-tile HUD
  // readout. The mapping records the natural home for the data.
  [VISUALIZATION_KIND.LOCATION]: PANEL_TYPE.MAP,
  [VISUALIZATION_KIND.POINT_CLOUD]: PANEL_TYPE.THREE_D,
  [VISUALIZATION_KIND.POSE]: PANEL_TYPE.THREE_D,
  [VISUALIZATION_KIND.RAW_IMAGE]: PANEL_TYPE.IMAGE,
  [VISUALIZATION_KIND.SCENE_UPDATE]: PANEL_TYPE.THREE_D,
});
