import {
  VISUALIZATION_KIND,
  type VisualizationKind,
} from "../ir/visualization-kinds";

export { VISUALIZATION_KIND } from "../ir/visualization-kinds";
export type { VisualizationKind } from "../ir/visualization-kinds";

/**
 * Neutral renderer families capable of presenting decoded visual artifacts.
 */
export const RENDERER_FAMILY = Object.freeze({
  AUDIO: "audio",
  IMAGE: "image",
  MAP: "map",
  PLOT: "plot",
  SCENE_3D: "scene-3d",
} as const);

/**
 * Union of semantic renderer-family ids.
 */
export type RendererFamily =
  (typeof RENDERER_FAMILY)[keyof typeof RENDERER_FAMILY];

/**
 * Visualization-to-renderer registry.
 */
export const VISUALIZATION_RENDERER_REGISTRY: Readonly<
  Record<VisualizationKind, RendererFamily>
> = Object.freeze({
  // Calibration is data, not imagery: its only renderable form is a camera
  // frustum in the 3D scene, so it maps to that renderer family.
  [VISUALIZATION_KIND.CAMERA_CALIBRATION]: RENDERER_FAMILY.SCENE_3D,
  [VISUALIZATION_KIND.COMPRESSED_AUDIO]: RENDERER_FAMILY.AUDIO,
  [VISUALIZATION_KIND.ENCODED_IMAGE]: RENDERER_FAMILY.IMAGE,
  [VISUALIZATION_KIND.ENCODED_VIDEO]: RENDERER_FAMILY.IMAGE,
  [VISUALIZATION_KIND.GRID]: RENDERER_FAMILY.SCENE_3D,
  [VISUALIZATION_KIND.IMAGE_ANNOTATIONS]: RENDERER_FAMILY.IMAGE,
  [VISUALIZATION_KIND.LOCATION]: RENDERER_FAMILY.MAP,
  [VISUALIZATION_KIND.POINT_CLOUD]: RENDERER_FAMILY.SCENE_3D,
  [VISUALIZATION_KIND.POSE]: RENDERER_FAMILY.SCENE_3D,
  [VISUALIZATION_KIND.RAW_AUDIO]: RENDERER_FAMILY.AUDIO,
  [VISUALIZATION_KIND.RAW_IMAGE]: RENDERER_FAMILY.IMAGE,
  [VISUALIZATION_KIND.SCENE_UPDATE]: RENDERER_FAMILY.SCENE_3D,
});
