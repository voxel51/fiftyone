/**
 * Tile kinds the episode shell can render. A tile kind is named for what
 * it shows ("image", "3d"), not for the sensor behind it. The same
 * values are stored on tiling entries and prefix persisted episode mosaic
 * leaf ids (`image-1`, `3d-1`) — see `episodeTileTypeFromId` in
 * episode-layout-persistence.
 *
 * Kept in a leaf module (no imports) so the tile catalog, the layout
 * resolver, and the tile bodies can all share it without cycles.
 */
export const EPISODE_TILE_TYPE = {
  IMAGE: "image",
  LOG: "log",
  MAP: "map",
  PLOT: "plot",
  RAW: "raw",
  THREE_D: "3d",
} as const;

export type EpisodeTileType =
  (typeof EPISODE_TILE_TYPE)[keyof typeof EPISODE_TILE_TYPE];

/**
 * Props every episode tile body accepts. `initialSourceId` is the source
 * the tile opens bound to (the layout resolver assigns one per default
 * tile); tiles fall back to their own source ranking when absent.
 */
export interface EpisodeTileProps {
  readonly initialSourceId?: string;
}
