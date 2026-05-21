// TODO: implement panel selection for visualization kinds.

/**
 * Stable visual artifact kinds emitted by decoders.
 */
export const VISUALIZATION_KIND = Object.freeze({
  ENCODED_IMAGE: "encoded-image",
  POINT_CLOUD: "point-cloud",
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
  typeof VISUALIZATION_KIND[keyof typeof VISUALIZATION_KIND];

/**
 * Union of panel family ids.
 */
export type PanelType = typeof PANEL_TYPE[keyof typeof PANEL_TYPE];

/**
 * Visualization-to-panel registry.
 */
export const VISUALIZATION_PANEL_REGISTRY: Readonly<
  Record<VisualizationKind, PanelType>
> = Object.freeze({
  [VISUALIZATION_KIND.ENCODED_IMAGE]: PANEL_TYPE.IMAGE,
  [VISUALIZATION_KIND.POINT_CLOUD]: PANEL_TYPE.THREE_D,
});
