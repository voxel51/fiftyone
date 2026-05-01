// TODO: implement panel selection for renderer archetypes.

export const RENDER_ARCHETYPE = Object.freeze({
  IMAGE_RAW: "image-raw",
  POINTS_3D: "points-3d",
} as const);

export const PANEL_TYPE = Object.freeze({
  IMAGE: "image",
  MAP: "map",
  THREE_D: "3D",
  TIMESERIES: "timeseries",
} as const);

export type RenderArchetypeKind =
  typeof RENDER_ARCHETYPE[keyof typeof RENDER_ARCHETYPE];
export type PanelType = typeof PANEL_TYPE[keyof typeof PANEL_TYPE];

/**
 * Archetype-to-panel registry.
 */
export const ARCHETYPE_REGISTRY: Readonly<
  Record<RenderArchetypeKind, PanelType>
> = Object.freeze({
  [RENDER_ARCHETYPE.IMAGE_RAW]: PANEL_TYPE.IMAGE,
  [RENDER_ARCHETYPE.POINTS_3D]: PANEL_TYPE.THREE_D,
});
