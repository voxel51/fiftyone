/** Basemap choices understood by the neutral map renderer. */
export const MAP_BASE_LAYER = {
  DEFAULT: "default",
  NONE: "none",
} as const;

/** A supported neutral map basemap choice. */
export type MapBaseLayer = (typeof MAP_BASE_LAYER)[keyof typeof MAP_BASE_LAYER];

/** Public OpenFreeMap style used by the default basemap. */
export const OPENFREEMAP_LIBERTY_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

/** Provider label shown while the default basemap loads. */
export const OPENFREEMAP_PROVIDER_NAME = "OpenFreeMap";
