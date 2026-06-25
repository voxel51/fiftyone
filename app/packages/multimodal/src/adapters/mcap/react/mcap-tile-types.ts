/**
 * Tile kinds the MCAP adapter can render. A tile kind is named for what
 * it shows ("image", "3d"), not for the sensor behind it. The values
 * prefix mosaic leaf ids (`image-1`, `3d-1`) — see
 * `mcapTileTypeFromId` in mcap-layout-persistence.
 *
 * Kept in a leaf module (no imports) so the tile catalog, the layout
 * resolver, and the tile bodies can all share it without cycles.
 */
export const MCAP_TILE_TYPE = {
  IMAGE: "image",
  THREE_D: "3d",
} as const;

export type McapTileType = (typeof MCAP_TILE_TYPE)[keyof typeof MCAP_TILE_TYPE];

/**
 * Props every MCAP tile body accepts. `initialSourceId` is the source
 * the tile opens bound to (the layout resolver assigns one per default
 * tile); tiles fall back to their own source ranking when absent.
 */
export interface McapTileProps {
  readonly initialSourceId?: string;
}
