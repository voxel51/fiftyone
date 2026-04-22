// TODO: implement panel selection for renderer archetypes.

export const RENDER_ARCHETYPE = {
  IMAGE_RAW: "image-raw",
  POINTS_3D: "points_3d",
} as const;

export const PANEL_TYPE = {
  IMAGE: "image",
  MAP: "map",
  THREE_D: "3D",
  TIMESERIES: "timeseries",
} as const;

/**
 * Archetype-to-panel registry.
 */
export const ARCHETYPE_REGISTRY: Record<
  typeof RENDER_ARCHETYPE[keyof typeof RENDER_ARCHETYPE],
  typeof PANEL_TYPE[keyof typeof PANEL_TYPE]
> = {
  [RENDER_ARCHETYPE.IMAGE_RAW]: PANEL_TYPE.IMAGE,
  [RENDER_ARCHETYPE.POINTS_3D]: PANEL_TYPE.THREE_D,
};
